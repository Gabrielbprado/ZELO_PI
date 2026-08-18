"""Construção da matriz de features.

Esta função é usada TANTO pelo treino QUANTO pela inferência. É a garantia
estrutural contra train/serve skew: não existe um segundo caminho de cálculo
que possa divergir silenciosamente.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import median

import numpy as np

from ..api.schemas import URGENCY_ORDINAL, Candidate, ClientProfile, Context
from ..model.collaborative import CollaborativeModel
from .bayes import DEFAULT_GLOBAL_RATING, bayesian_rating, beta_smoothed_rate, log1p_safe
from .geo import geo_decay, rank_percentile
from .names import FEATURE_NAMES, N_FEATURES

#: Suavização da afinidade de categoria, em "bookings equivalentes".
CATEGORY_AFFINITY_ALPHA = 3.0

#: Amplitude (em log) considerada "faixa de preço compatível". log(3) ≈ 1.1
#: significa que pagar 3× o ticket habitual zera o encaixe.
PRICE_LOG_RANGE = math.log(3.0)


@dataclass
class GlobalStats:
    """Estatísticas da janela de TREINO. Nunca do conjunto completo."""

    global_rating_mean: float = DEFAULT_GLOBAL_RATING
    #: categoria → participação no total de bookings (prior de afinidade).
    category_priors: dict[str, float] = field(default_factory=dict)


def build_feature_matrix(
    client: ClientProfile,
    context: Context,
    candidates: list[Candidate],
    cf: CollaborativeModel | None = None,
    stats: GlobalStats | None = None,
    hired_provider_ids: list[str] | None = None,
) -> np.ndarray:
    """Matriz ``(n_candidatos, N_FEATURES)`` alinhada a ``FEATURE_NAMES``."""
    stats = stats or GlobalStats()
    n = len(candidates)
    if n == 0:
        return np.empty((0, N_FEATURES), dtype=np.float64)

    hired = hired_provider_ids or []

    # ── Passo 1: grandezas que dependem do CONJUNTO de candidatos ───────
    cf_scores = [
        cf.score(client.id, c.provider_id, c.category_ids) if cf else math.nan for c in candidates
    ]
    cf_pct = rank_percentile(cf_scores, higher_is_better=True)

    distances = [c.distance_km if c.distance_km is not None else math.nan for c in candidates]
    # Percentil de proximidade: mais perto ⇒ mais alto.
    geo_pct = rank_percentile(distances, higher_is_better=False)

    prices = [max(0.0, c.price_from) for c in candidates]
    positive_prices = [p for p in prices if p > 0]
    price_median = median(positive_prices) if positive_prices else 0.0
    # Mais barato ⇒ percentil mais alto. O modelo decide se isso é bom.
    price_pct = rank_percentile([float(p) for p in prices], higher_is_better=False)

    affinities = [_category_affinity(client, c, stats) for c in candidates]
    affinity_pct = rank_percentile(affinities, higher_is_better=True)

    # ── Passo 2: contexto (idêntico para todos os candidatos) ──────────
    at = context.at
    urgency_ord = float(URGENCY_ORDINAL.get(context.urgency or "FLEXIBLE", 0))
    hour_sin, hour_cos = _cyclical(at.hour, 24)
    dow_sin, dow_cos = _cyclical(at.weekday(), 7)
    month_sin, month_cos = _cyclical(at.month - 1, 12)

    c_booking_log = log1p_safe(client.booking_count)
    c_days_last = (
        client.days_since_last_booking if client.days_since_last_booking is not None else math.nan
    )
    c_ticket_log = log1p_safe(client.avg_ticket) if client.avg_ticket else math.nan
    c_is_cold = 1.0 if client.booking_count <= 0 else 0.0

    matrix = np.empty((n, N_FEATURES), dtype=np.float64)

    for i, cand in enumerate(candidates):
        finished = cand.completed_count + cand.cancelled_count
        touched = finished + cand.accepted_count + cand.requested_count
        matched = 1.0 if (context.category_id and context.category_id in cand.category_ids) else 0.0
        n_cats = max(1, len(cand.category_ids))
        accept_rate = beta_smoothed_rate(
            cand.accepted_count + cand.completed_count, touched, prior_mean=0.7, strength=5.0
        )

        matrix[i] = (
            # Prior de qualidade
            bayesian_rating(cand.rating_avg, cand.rating_count, stats.global_rating_mean),
            log1p_safe(cand.rating_count),
            beta_smoothed_rate(cand.completed_count, finished, prior_mean=0.8, strength=5.0),
            beta_smoothed_rate(cand.cancelled_count, finished, prior_mean=0.2, strength=5.0),
            # Conteúdo
            float(cand.years_exp),
            log1p_safe(cand.jobs_done),
            log1p_safe(cand.price_from),
            1.0 if cand.verified else 0.0,
            1.0 if cand.available else 0.0,
            float(len(cand.category_ids)),
            log1p_safe(cand.tenure_days),
            log1p_safe(cand.service_median_price) if cand.service_median_price else math.nan,
            # Colaborativas
            cf_scores[i],
            cf_pct[i],
            float(cand.prior_bookings_with_client),
            float(cand.prior_completed_with_client),
            cand.days_since_last_with_client
            if cand.days_since_last_with_client is not None
            else math.nan,
            cf.knn_score(hired, cand.provider_id, cand.category_ids) if cf else math.nan,
            # Afinidade de categoria
            affinities[i],
            affinity_pct[i],
            matched,
            matched / n_cats,
            # Preço
            _price_band_fit(cand.price_from, client.avg_ticket),
            (cand.price_from / price_median) if price_median > 0 else math.nan,
            price_pct[i],
            # Geográficas
            distances[i],
            geo_decay(cand.distance_km),
            1.0 if cand.same_neighborhood else 0.0,
            1.0 if cand.same_city else 0.0,
            geo_pct[i],
            # Comportamento do cliente
            c_booking_log,
            c_days_last,
            float(client.distinct_categories),
            c_ticket_log,
            c_is_cold,
            # Contexto
            urgency_ord,
            hour_sin,
            hour_cos,
            dow_sin,
            dow_cos,
            month_sin,
            month_cos,
            (urgency_ord / 3.0) * accept_rate,
            # Responsividade
            accept_rate,
            cand.median_response_hours if cand.median_response_hours is not None else math.nan,
            # Nota crua + presença de histórico
            float(cand.rating_avg),
            1.0 if cand.rating_count > 0 else 0.0,
        )

    assert matrix.shape[1] == len(FEATURE_NAMES), "matriz fora de sincronia com FEATURE_NAMES"
    return matrix


def _cyclical(value: int, period: int) -> tuple[float, float]:
    """Codifica tempo como (sin, cos): hora 23 fica adjacente à hora 0."""
    angle = 2.0 * math.pi * (value % period) / period
    return math.sin(angle), math.cos(angle)


def _category_affinity(client: ClientProfile, cand: Candidate, stats: GlobalStats) -> float:
    """Quanto as categorias deste profissional batem com o histórico do cliente.

    Suavizado pelo prior global: um cliente com 2 bookings não deve ter
    afinidade 1.0 numa categoria só porque foi a única que ele usou.
    """
    total = sum(client.category_counts.values())
    best = 0.0
    for cid in cand.category_ids:
        prior = stats.category_priors.get(cid, 1.0 / 8.0)
        count = client.category_counts.get(cid, 0)
        share = (count + CATEGORY_AFFINITY_ALPHA * prior) / (total + CATEGORY_AFFINITY_ALPHA)
        best = max(best, share)
    return best


def _price_band_fit(price_from: float, avg_ticket: float | None) -> float:
    """1.0 quando o preço bate com o ticket habitual do cliente; 0.0 quando destoa.

    NaN sem histórico de gasto — encaixe de preço é literalmente indefinido para
    quem nunca contratou nada.
    """
    if not avg_ticket or avg_ticket <= 0 or price_from <= 0:
        return math.nan
    gap = abs(math.log(price_from) - math.log(avg_ticket))
    return max(0.0, 1.0 - gap / PRICE_LOG_RANGE)
