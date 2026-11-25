"""Baselines de comparação.

O baseline que importa é `rating_desc`: ele reproduz LITERALMENTE a ordenação
que o app usa hoje (`providers.service.ts` → `orderBy: { ratingAvg: 'desc' }`).
Se o modelo não superar esse número, não há motivo para colocar um serviço a
mais em produção — e o relatório precisa deixar isso visível, não escondido
atrás de uma métrica absoluta bonita.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from ..model.fallback import heuristic_scores
from .dataset import Example

#: Assinatura: (exemplo, matriz de features) → vetor de scores.
Baseline = Callable[[Example, np.ndarray], np.ndarray]


def rating_desc(example: Example, _matrix: np.ndarray) -> np.ndarray:
    """Ordenação atual do produto: ratingAvg desc, com 0.0 para quem nunca foi avaliado."""
    return np.asarray([c.rating_avg for c in example.candidates], dtype=np.float64)


def popularity(example: Example, _matrix: np.ndarray) -> np.ndarray:
    return np.asarray([c.jobs_done for c in example.candidates], dtype=np.float64)


def distance_asc(example: Example, _matrix: np.ndarray) -> np.ndarray:
    # Sem distância conhecida, empata por baixo em vez de ganhar por acidente.
    return np.asarray(
        [-(c.distance_km if c.distance_km is not None else 1e6) for c in example.candidates],
        dtype=np.float64,
    )


def bayes_geo(_example: Example, matrix: np.ndarray) -> np.ndarray:
    """A própria heurística de fallback do runtime.

    Comparar com ela responde a pergunta que ninguém costuma fazer: o modelo
    treinado é melhor que a rede de segurança que já teríamos de manter?
    """
    return heuristic_scores(matrix)


BASELINES: dict[str, Baseline] = {
    "rating_desc": rating_desc,
    "popularity": popularity,
    "distance_asc": distance_asc,
    "bayes_geo": bayes_geo,
}

#: Referência para o gate de release.
PRIMARY_BASELINE = "rating_desc"
