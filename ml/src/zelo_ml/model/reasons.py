"""Explicabilidade: por que este profissional apareceu.

Deliberadamente NÃO usa SHAP. SHAP acrescentaria uma dependência pesada,
multiplicaria a latência por ~10 e produziria atribuições por feature que não
viram texto honesto para o usuário final ("p_rating_bayes contribuiu +0,03" não
significa nada para quem quer contratar um encanador).

Em vez disso, cada motivo é um predicado legível sobre a linha de features, com
prioridade fixa. O serviço devolve apenas CÓDIGOS e números; o texto em pt-BR
vive no Node (`backend/src/constants/recommendations.ts`), então i18n fica numa
camada só e o app pode mapear código → ícone.
"""

from __future__ import annotations

import math
from typing import cast

import numpy as np

from ..api.schemas import ReasonCode
from ..features.names import FEATURE_INDEX

MAX_REASONS = 2

#: (código, prioridade, índice da feature que vira `value`). Prioridade maior
#: ganha quando vários predicados disparam.
_PRIORITY: list[tuple[str, int, str | None]] = [
    ("REHIRE", 100, "cxp_prior_bookings"),
    ("SAME_CATEGORY_HISTORY", 80, "cat_affinity"),
    ("SIMILAR_CLIENTS", 70, "cf_rank_pct"),
    ("NEARBY", 65, "geo_distance_km"),
    ("TOP_RATED", 60, "p_rating_bayes"),
    ("FAST_RESPONSE", 50, "p_median_response_hours"),
    ("PRICE_FIT", 45, "price_band_fit"),
    ("NEW_TALENT", 40, None),
    ("VERIFIED", 20, None),
]

NEARBY_KM = 3.0
TOP_RATED_MIN = 4.6
TOP_RATED_MIN_COUNT = 5.0
SIMILAR_CLIENTS_MIN_PCT = 0.8
PRICE_FIT_MIN = 0.8
FAST_RESPONSE_MAX_HOURS = 2.0
NEW_TALENT_MAX_TENURE_DAYS = 45.0


def _get(row: np.ndarray, name: str) -> float:
    return float(row[FEATURE_INDEX[name]])


def _fires(code: str, row: np.ndarray, forced_new_talent: bool) -> bool:
    if code == "REHIRE":
        return _get(row, "cxp_prior_bookings") >= 1.0
    if code == "SAME_CATEGORY_HISTORY":
        return _get(row, "p_category_match") >= 1.0 and _get(row, "cat_affinity") >= 0.35
    if code == "SIMILAR_CLIENTS":
        pct = _get(row, "cf_rank_pct")
        return not math.isnan(pct) and pct >= SIMILAR_CLIENTS_MIN_PCT
    if code == "NEARBY":
        dist = _get(row, "geo_distance_km")
        return not math.isnan(dist) and dist <= NEARBY_KM
    if code == "TOP_RATED":
        return (
            _get(row, "p_rating_bayes") >= TOP_RATED_MIN
            and math.expm1(_get(row, "p_rating_count_log")) >= TOP_RATED_MIN_COUNT
        )
    if code == "FAST_RESPONSE":
        hours = _get(row, "p_median_response_hours")
        return not math.isnan(hours) and hours <= FAST_RESPONSE_MAX_HOURS
    if code == "PRICE_FIT":
        fit = _get(row, "price_band_fit")
        return not math.isnan(fit) and fit >= PRICE_FIT_MIN
    if code == "NEW_TALENT":
        return forced_new_talent or (
            math.expm1(_get(row, "p_tenure_days_log")) <= NEW_TALENT_MAX_TENURE_DAYS
            and _get(row, "p_verified") >= 1.0
        )
    if code == "VERIFIED":
        return _get(row, "p_verified") >= 1.0
    return False


def explain(
    row: np.ndarray, forced_new_talent: bool = False
) -> list[tuple[ReasonCode, float | None]]:
    """Top-2 motivos para esta linha de features, do mais forte para o mais fraco."""
    hits: list[tuple[int, ReasonCode, float | None]] = []
    for code, priority, value_feature in _PRIORITY:
        if not _fires(code, row, forced_new_talent):
            continue
        value: float | None = None
        if value_feature is not None:
            raw = _get(row, value_feature)
            value = None if math.isnan(raw) else round(raw, 2)
        # NEW_TALENT forçado pela exploração sobe na fila: é a razão real de a
        # vaga existir, e escondê-la tornaria a explicação desonesta.
        effective = priority + (1000 if code == "NEW_TALENT" and forced_new_talent else 0)
        hits.append((effective, cast(ReasonCode, code), value))

    hits.sort(key=lambda t: t[0], reverse=True)
    return [(code, value) for _, code, value in hits[:MAX_REASONS]]
