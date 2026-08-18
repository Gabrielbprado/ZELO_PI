"""O ranker: gradient boosting com restrições de monotonicidade.

Por que ``HistGradientBoostingClassifier`` e não uma regressão logística ou uma
rede:

* **NaN nativo.** Cliente sem histórico legitimamente não tem sinal
  colaborativo nem encaixe de preço. Imputar zero ou a média seria inventar
  informação; a árvore aprende uma direção própria para "ausente".
* **Restrições de monotonicidade.** Podemos exigir que nota melhor nunca reduza
  o score e que distância maior nunca o aumente. Isso impede o modelo de
  aprender artefatos do gerador sintético e, principalmente, mantém as
  explicações coerentes com o ranking.
* **Custo.** ~200 KB de artefato, treino em segundos, zero dependência além do
  scikit-learn que já é necessário para o SVD.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

from ..features.names import monotonic_constraints


def build_ranker(random_state: int = 42, max_iter: int = 300) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        loss="log_loss",
        learning_rate=0.06,
        max_iter=max_iter,
        max_leaf_nodes=31,
        min_samples_leaf=20,
        l2_regularization=1.0,
        monotonic_cst=monotonic_constraints(),
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=25,
        random_state=random_state,
    )


def train_ranker(
    features: np.ndarray,
    labels: np.ndarray,
    random_state: int = 42,
) -> HistGradientBoostingClassifier:
    if features.shape[0] == 0:
        raise ValueError("conjunto de treino vazio")
    unique = np.unique(labels)
    if unique.size < 2:
        raise ValueError(
            f"rótulos degenerados ({unique.tolist()}): sem positivo e negativo não há o que aprender"
        )
    model = build_ranker(random_state=random_state)
    model.fit(features, labels)
    return model


def predict_scores(model: HistGradientBoostingClassifier, features: np.ndarray) -> np.ndarray:
    """Probabilidade da classe positiva, alinhada às linhas de ``features``."""
    if features.shape[0] == 0:
        return np.empty(0, dtype=np.float64)
    return model.predict_proba(features)[:, 1]
