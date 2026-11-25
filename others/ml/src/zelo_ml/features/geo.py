"""Transformações geográficas."""

from __future__ import annotations

import math

#: Constante de decaimento (km). Com tau=5, a "meia-vida" da atratividade fica
#: em ~3,5 km — coerente com deslocamento urbano em São Paulo, onde 3 km e 6 km
#: são experiências muito diferentes, mas 20 km e 25 km são ambas "longe".
DISTANCE_TAU_KM = 5.0

#: Acima disso, tratamos como igualmente distante (evita cauda numérica).
MAX_MEANINGFUL_KM = 60.0


def geo_decay(distance_km: float | None, tau: float = DISTANCE_TAU_KM) -> float:
    """Converte distância em atratividade decrescente no intervalo (0, 1].

    NaN entra, NaN sai: sem âncora geográfica do cliente não existe distância, e
    inventar 0 (perto) ou 999 (longe) enviesaria o ranking dos dois jeitos.

    >>> geo_decay(0.0)
    1.0
    >>> geo_decay(None)
    nan
    >>> geo_decay(5.0) < geo_decay(1.0)
    True
    """
    if distance_km is None or math.isnan(distance_km):
        return math.nan
    d = min(max(0.0, float(distance_km)), MAX_MEANINGFUL_KM)
    return math.exp(-d / tau)


def rank_percentile(values: list[float], higher_is_better: bool) -> list[float]:
    """Percentil de cada valor dentro da própria lista, em [0, 1].

    Features de percentil são livres de escala: sobrevivem a mudanças na
    densidade de profissionais e no tamanho do conjunto de candidatos, o que um
    score cru não faz. NaN permanece NaN e não ocupa posição no ranking.
    """
    n = len(values)
    if n == 0:
        return []

    indexed = [(v, i) for i, v in enumerate(values) if not math.isnan(v)]
    out = [math.nan] * n
    if not indexed:
        return out
    if len(indexed) == 1:
        out[indexed[0][1]] = 1.0
        return out

    indexed.sort(key=lambda t: t[0], reverse=higher_is_better)
    denom = len(indexed) - 1
    for position, (_, original_index) in enumerate(indexed):
        # Melhor posição => 1.0; pior => 0.0.
        out[original_index] = 1.0 - (position / denom)
    return out
