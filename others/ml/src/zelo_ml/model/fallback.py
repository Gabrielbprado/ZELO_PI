"""Ranking heurístico — a rede de segurança do serviço.

Usado quando não existe artefato treinado (deploy novo, banco recriado, modelo
recusado por incompatibilidade de schema). O serviço NUNCA devolve 503 por falta
de modelo: devolve 200 com `strategy="heuristic_fallback"` e uma ordenação
defensável. Um carrossel um pouco pior é infinitamente melhor que uma tela de
erro na Home.

Note que já é melhor que a ordenação atual do app (`ratingAvg desc`), porque
aplica o prior bayesiano — logo, profissional novo não afunda atrás de um de
1 estrela.
"""

from __future__ import annotations

import math

import numpy as np

from ..features.names import FEATURE_INDEX

RATING_WEIGHT = 0.7
POPULARITY_WEIGHT = 0.3
GEO_WEIGHT = 0.6


def heuristic_scores(matrix: np.ndarray) -> np.ndarray:
    """Score em [0, 1] combinando qualidade bayesiana, volume e proximidade."""
    if matrix.shape[0] == 0:
        return np.empty(0, dtype=np.float64)

    rating = matrix[:, FEATURE_INDEX["p_rating_bayes"]]
    jobs = matrix[:, FEATURE_INDEX["p_jobs_done_log"]]
    decay = matrix[:, FEATURE_INDEX["geo_decay"]]
    available = matrix[:, FEATURE_INDEX["p_available"]]

    quality = RATING_WEIGHT * _normalize(rating) + POPULARITY_WEIGHT * _normalize(jobs)

    # Sem âncora geográfica a distância é NaN para todos — nesse caso o fator
    # geográfico vira neutro (1.0) em vez de zerar o score de todo mundo.
    geo = np.where(np.isnan(decay), 1.0, 1.0 - GEO_WEIGHT + GEO_WEIGHT * np.nan_to_num(decay))

    # Indisponível não é excluído (pode virar disponível), mas é penalizado.
    availability = np.where(available >= 1.0, 1.0, 0.6)

    return np.clip(quality * geo * availability, 0.0, 1.0)


def _normalize(values: np.ndarray) -> np.ndarray:
    """Min-max robusto a NaN e a vetores constantes."""
    finite = values[~np.isnan(values)]
    if finite.size == 0:
        return np.zeros_like(values)
    lo = float(np.min(finite))
    hi = float(np.max(finite))
    if math.isclose(hi, lo):
        return np.where(np.isnan(values), 0.5, 0.5)
    scaled = (values - lo) / (hi - lo)
    return np.where(np.isnan(scaled), 0.5, scaled)
