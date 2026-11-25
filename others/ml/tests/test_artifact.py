"""Serialização e compatibilidade do artefato."""

from __future__ import annotations

import numpy as np
import pytest

from zelo_ml.features.builders import GlobalStats
from zelo_ml.model.artifact import (
    IncompatibleArtifactError,
    ModelBundle,
    from_bytes,
    load_from_file,
    make_version,
    save_to_file,
    to_bytes,
)
from zelo_ml.model.collaborative import CollaborativeModel, fit_collaborative
from zelo_ml.model.ranker import build_ranker


def _bundle(**overrides) -> ModelBundle:
    ranker = build_ranker(max_iter=5)
    rng = np.random.RandomState(0)
    X = rng.rand(60, 47)
    y = (X[:, 0] > 0.5).astype(int)
    ranker.fit(X, y)
    defaults = {
        "version": make_version("abc1234"),
        "ranker": ranker,
        "collaborative": CollaborativeModel(),
        "stats": GlobalStats(global_rating_mean=4.3),
        "metrics": {"ndcg@8": 0.35},
    }
    defaults.update(overrides)
    return ModelBundle(**defaults)


def test_roundtrip_preserva_modelo_e_metricas():
    original = _bundle()
    recuperado = from_bytes(to_bytes(original))
    assert recuperado.version == original.version
    assert recuperado.metrics["ndcg@8"] == 0.35
    assert recuperado.stats.global_rating_mean == 4.3
    entrada = np.random.RandomState(1).rand(3, 47)
    assert np.allclose(
        recuperado.ranker.predict_proba(entrada), original.ranker.predict_proba(entrada)
    )


def test_versao_de_schema_divergente_e_recusada():
    bundle = _bundle()
    blob = to_bytes(bundle)
    bundle.schema_version = 99
    with pytest.raises(IncompatibleArtifactError, match="schema_version"):
        bundle.validate()
    assert from_bytes(blob).schema_version == 1


def test_lista_de_features_divergente_e_recusada():
    """Melhor servir a heurística do que pontuar com features desalinhadas."""
    bundle = _bundle(feature_names=("p_rating_bayes", "inventada"))
    with pytest.raises(IncompatibleArtifactError, match="features divergente"):
        bundle.validate()


def test_salva_e_carrega_do_disco(tmp_path):
    bundle = _bundle()
    caminho = save_to_file(bundle, tmp_path)
    assert caminho.exists()
    assert (tmp_path / "latest.txt").read_text().strip() == caminho.name
    assert load_from_file(tmp_path).version == bundle.version


def test_diretorio_sem_ponteiro_devolve_none(tmp_path):
    assert load_from_file(tmp_path) is None


def test_ponteiro_apontando_para_arquivo_ausente_nao_quebra(tmp_path):
    (tmp_path / "latest.txt").write_text("model-inexistente.joblib")
    assert load_from_file(tmp_path) is None


def test_blob_gigante_e_recusado():
    with pytest.raises(IncompatibleArtifactError, match="excede o limite"):
        from_bytes(b"x" * 17_000_000)


def test_colaborativo_sem_interacoes_nao_quebra():
    modelo = fit_collaborative([])
    assert np.isnan(modelo.score("cli", "pro"))
    assert np.isnan(modelo.knn_score([], "pro"))


def test_colaborativo_pontua_afinidade_conhecida():
    interacoes = [("c1", "p1", 2.0), ("c1", "p2", 1.0), ("c2", "p2", 2.0), ("c2", "p3", 1.0)]
    modelo = fit_collaborative(interacoes, {"p1": ["plumb"], "p2": ["plumb"], "p3": ["bolt"]})
    assert not np.isnan(modelo.score("c1", "p1"))
    assert np.isnan(modelo.score("cliente-novo", "p1")), "cliente sem histórico não tem sinal"
    # Profissional desconhecido cai no centróide da categoria em vez de sumir.
    assert modelo.item_vector("p-novo", ["plumb"]) is not None
    assert modelo.item_vector("p-novo", ["categoria-inexistente"]) is None
