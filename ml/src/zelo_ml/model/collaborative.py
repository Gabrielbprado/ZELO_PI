"""Sinal colaborativo por fatoração de matriz (TruncatedSVD).

Escolha explícita contra o LightFM: o último release do LightFM é de março de
2023, ele só publica sdist (build de extensão C) e tem problemas conhecidos em
Python 3.12+. Num free tier sem cache de build isso é falha de deploy esperando
acontecer — e para uma matriz de 200×60 a perda de qualidade frente ao WARP é
imperceptível. Se o catálogo passar de ~10^5 usuários, o caminho é `implicit`
(ALS, com wheels publicadas), não LightFM.

O score aqui NÃO é somado à mão a nenhum outro sinal: ele entra como uma feature
do ranker, e o peso é aprendido.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD

DEFAULT_COMPONENTS = 24


@dataclass
class CollaborativeModel:
    """Fatores latentes de clientes e profissionais.

    ``user_factors`` guarda U·S (a projeção das linhas) e ``item_factors``
    guarda V, de modo que ``u @ v`` reconstrói a entrada da matriz.
    """

    user_factors: dict[str, np.ndarray] = field(default_factory=dict)
    item_factors: dict[str, np.ndarray] = field(default_factory=dict)
    #: Centróide dos fatores por categoria — usado para dar um vetor plausível a
    #: profissional novo, em vez de deixá-lo sem sinal para sempre.
    category_centroids: dict[str, np.ndarray] = field(default_factory=dict)
    n_components: int = DEFAULT_COMPONENTS

    # ── Consulta ────────────────────────────────────────────────────────

    def item_vector(
        self, provider_id: str, category_ids: list[str] | None = None
    ) -> np.ndarray | None:
        """Fator do profissional, com fallback para o centróide da categoria."""
        vec = self.item_factors.get(provider_id)
        if vec is not None:
            return vec
        for cid in category_ids or []:
            centroid = self.category_centroids.get(cid)
            if centroid is not None:
                return centroid
        return None

    def score(
        self,
        client_id: str | None,
        provider_id: str,
        category_ids: list[str] | None = None,
    ) -> float:
        """Afinidade estimada. NaN quando não há sinal para este cliente."""
        if client_id is None:
            return math.nan
        u = self.user_factors.get(client_id)
        if u is None:
            return math.nan
        v = self.item_vector(provider_id, category_ids)
        if v is None:
            return math.nan
        return float(np.dot(u, v))

    def knn_score(
        self,
        hired_provider_ids: list[str],
        provider_id: str,
        category_ids: list[str] | None = None,
    ) -> float:
        """Maior similaridade cosseno entre este profissional e os já contratados.

        Complementa o `score`: captura "parecido com quem você já aprovou" mesmo
        quando o fator do próprio usuário é ruidoso por ter poucas interações.
        """
        target = self.item_vector(provider_id, category_ids)
        if target is None or not hired_provider_ids:
            return math.nan
        target_norm = float(np.linalg.norm(target))
        if target_norm == 0.0:
            return math.nan

        best = math.nan
        for pid in hired_provider_ids:
            if pid == provider_id:
                continue
            other = self.item_factors.get(pid)
            if other is None:
                continue
            other_norm = float(np.linalg.norm(other))
            if other_norm == 0.0:
                continue
            sim = float(np.dot(target, other)) / (target_norm * other_norm)
            if math.isnan(best) or sim > best:
                best = sim
        return best


def fit_collaborative(
    interactions: list[tuple[str, str, float]],
    provider_categories: dict[str, list[str]] | None = None,
    n_components: int = DEFAULT_COMPONENTS,
    random_state: int = 42,
) -> CollaborativeModel:
    """Treina a fatoração sobre feedback implícito ``(cliente, profissional, peso)``.

    Só deve receber interações da JANELA DE TREINO. Passar o conjunto completo
    vazaria futuro para a validação e inflaria as métricas.
    """
    if not interactions:
        return CollaborativeModel(n_components=n_components)

    user_ids = sorted({u for u, _, _ in interactions})
    item_ids = sorted({i for _, i, _ in interactions})
    user_index = {u: k for k, u in enumerate(user_ids)}
    item_index = {i: k for k, i in enumerate(item_ids)}

    rows, cols, data = [], [], []
    for user, item, weight in interactions:
        rows.append(user_index[user])
        cols.append(item_index[item])
        data.append(float(weight))

    matrix = csr_matrix(
        (data, (rows, cols)), shape=(len(user_ids), len(item_ids)), dtype=np.float64
    )

    # n_components precisa caber na menor dimensão (e sobrar 1 para o SVD).
    k = max(1, min(n_components, min(matrix.shape) - 1))
    svd = TruncatedSVD(n_components=k, random_state=random_state)
    user_matrix = svd.fit_transform(matrix)  # U·S
    item_matrix = svd.components_.T  # V

    model = CollaborativeModel(
        user_factors={u: user_matrix[user_index[u]] for u in user_ids},
        item_factors={i: item_matrix[item_index[i]] for i in item_ids},
        n_components=k,
    )

    if provider_categories:
        model.category_centroids = _category_centroids(model.item_factors, provider_categories, k)
    return model


def _category_centroids(
    item_factors: dict[str, np.ndarray],
    provider_categories: dict[str, list[str]],
    k: int,
) -> dict[str, np.ndarray]:
    buckets: dict[str, list[np.ndarray]] = {}
    for provider_id, vec in item_factors.items():
        for cid in provider_categories.get(provider_id, []):
            buckets.setdefault(cid, []).append(vec)
    return {
        cid: np.mean(np.vstack(vecs), axis=0) if vecs else np.zeros(k)
        for cid, vecs in buckets.items()
    }
