"""Suavização bayesiana de médias com amostra pequena."""

from __future__ import annotations

import math

#: Força do prior da nota, em "avaliações equivalentes". 10 ≈ mediana de
#: ratingCount no seed: quem tem 10 avaliações fica na metade do caminho entre a
#: média global e a própria média.
RATING_PRIOR_STRENGTH = 10.0

#: Média global usada quando o treino ainda não calculou a sua.
DEFAULT_GLOBAL_RATING = 4.2


def bayesian_rating(
    rating_avg: float,
    rating_count: int,
    global_mean: float = DEFAULT_GLOBAL_RATING,
    strength: float = RATING_PRIOR_STRENGTH,
) -> float:
    """Nota suavizada em direção à média global.

    Corrige um defeito real do produto: ``ProviderProfile.ratingAvg`` tem
    default ``0.0``, então a ordenação atual (``ratingAvg desc``) coloca um
    profissional recém-cadastrado ABAIXO de um profissional de 1 estrela. Aqui,
    quem não tem avaliação recebe a média global — nem prêmio, nem punição.

    >>> round(bayesian_rating(0.0, 0, 4.2), 3)
    4.2
    >>> round(bayesian_rating(5.0, 1, 4.2), 3)   # 1 nota 5 não vira 5.0
    4.273
    >>> round(bayesian_rating(5.0, 500, 4.2), 3) # com volume, converge
    4.984
    """
    if rating_count <= 0:
        return global_mean
    total = rating_avg * rating_count
    return (strength * global_mean + total) / (strength + rating_count)


def beta_smoothed_rate(
    successes: int,
    total: int,
    prior_mean: float = 0.8,
    strength: float = 5.0,
) -> float:
    """Taxa (0..1) suavizada por um prior Beta.

    Sem isso, "1 de 1 concluído" viraria 100% e ganharia de "180 de 200".
    """
    if total <= 0:
        return prior_mean
    a = prior_mean * strength
    b = (1.0 - prior_mean) * strength
    return (a + successes) / (a + b + total)


def log1p_safe(value: float | None) -> float:
    """``log(1+x)`` tolerante a None e a negativos espúrios."""
    if value is None:
        return math.nan
    return math.log1p(max(0.0, float(value)))
