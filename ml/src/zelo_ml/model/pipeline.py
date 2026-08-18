"""Orquestração da inferência: features → score → estratégia → motivos."""

from __future__ import annotations

import logging
import math
import random

import numpy as np

from ..api.schemas import RankedItem, RankRequest, Reason, Strategy
from ..features.builders import build_feature_matrix
from ..features.names import FEATURE_INDEX
from .artifact import ModelBundle
from .fallback import heuristic_scores
from .ranker import predict_scores
from .reasons import explain

logger = logging.getLogger(__name__)

#: Fração do topo reservada a exploração (ε-greedy).
DEFAULT_EXPLORATION_RATIO = 0.12
NEW_TALENT_MAX_TENURE_DAYS = 45.0


def rank(
    request: RankRequest,
    bundle: ModelBundle | None,
    exploration_ratio: float = DEFAULT_EXPLORATION_RATIO,
    rng: random.Random | None = None,
) -> tuple[list[RankedItem], Strategy]:
    """Ordena os candidatos e explica cada posição."""
    candidates = request.candidates
    if not candidates:
        return [], "heuristic_fallback" if bundle is None else "ranker"

    hired = [c.provider_id for c in candidates if c.prior_bookings_with_client > 0]

    matrix = build_feature_matrix(
        client=request.client,
        context=request.context,
        candidates=candidates,
        cf=bundle.collaborative if bundle else None,
        stats=bundle.stats if bundle else None,
        hired_provider_ids=hired,
    )

    strategy: Strategy
    if bundle is None:
        scores = heuristic_scores(matrix)
        strategy = "heuristic_fallback"
    elif request.client.booking_count <= 0 and _no_geo_signal(matrix):
        # Cliente frio E sem âncora geográfica: quase toda feature discriminante
        # é NaN. O ranker ainda responderia, mas estaria essencialmente
        # ordenando por popularidade com uma camada de incerteza por cima —
        # melhor dizer isso explicitamente na resposta.
        scores = heuristic_scores(matrix)
        strategy = "cold_start_popularity"
    else:
        try:
            scores = predict_scores(bundle.ranker, matrix)
            strategy = "ranker"
        except Exception:  # pragma: no cover - defesa em profundidade
            logger.exception("ranker falhou; degradando para heurística")
            scores = heuristic_scores(matrix)
            strategy = "heuristic_fallback"

    order = list(np.argsort(-scores, kind="stable"))
    limit = min(request.context.limit, len(order))
    order, explored = _apply_exploration(order, matrix, limit, exploration_ratio, rng)

    items: list[RankedItem] = []
    for position, idx in enumerate(order[:limit]):
        reasons = explain(matrix[idx], forced_new_talent=idx in explored)
        items.append(
            RankedItem(
                provider_id=candidates[idx].provider_id,
                score=float(round(scores[idx], 6)),
                rank=position + 1,
                reasons=[Reason(code=code, value=value) for code, value in reasons],
            )
        )
    return items, strategy


def _no_geo_signal(matrix: np.ndarray) -> bool:
    column = matrix[:, FEATURE_INDEX["geo_distance_km"]]
    return bool(np.all(np.isnan(column)))


def _apply_exploration(
    order: list[int],
    matrix: np.ndarray,
    limit: int,
    ratio: float,
    rng: random.Random | None,
) -> tuple[list[int], set[int]]:
    """Reserva uma vaga do topo para um profissional novo e verificado.

    Sem exploração, o sistema nunca gera telemetria para quem acabou de entrar:
    nunca aparece ⇒ nunca é clicado ⇒ nunca ganha histórico ⇒ nunca aparece. Esse
    laço de "rico fica mais rico" é fatal num marketplace de dois lados, porque
    seca a oferta. Uma vaga em oito é o preço de manter o catálogo vivo.
    """
    if ratio <= 0 or limit <= 0 or len(order) <= limit:
        return order, set()

    generator = rng or random.Random()
    if generator.random() >= ratio:
        return order, set()

    tenure = matrix[:, FEATURE_INDEX["p_tenure_days_log"]]
    verified = matrix[:, FEATURE_INDEX["p_verified"]]
    head = set(order[:limit])

    newcomers = [
        idx
        for idx in order[limit:]
        if idx not in head
        and verified[idx] >= 1.0
        and math.expm1(tenure[idx]) <= NEW_TALENT_MAX_TENURE_DAYS
    ]
    if not newcomers:
        return order, set()

    chosen = generator.choice(newcomers)
    # Entra na última posição visível: explora sem sacrificar o melhor resultado.
    reordered = [i for i in order if i != chosen]
    reordered.insert(limit - 1, chosen)
    return reordered, {chosen}
