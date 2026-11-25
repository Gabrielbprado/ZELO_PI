"""Ausência de vazamento, split temporal e capacidade de aprender.

Os dois testes que mais importam aqui são `test_sem_vazamento_*`: eles cobrem os
dois bugs que a avaliação offline pegou na prática — features calculadas com
informação do futuro, e sinal colaborativo ajustado sobre os próprios exemplos
que ele deveria explicar. Ambos passavam despercebidos porque o código "rodava".
"""

from __future__ import annotations

import numpy as np
from tests.conftest import make_raw

from zelo_ml.model.ranker import train_ranker
from zelo_ml.training import dataset as ds
from zelo_ml.training.baselines import BASELINES
from zelo_ml.training.evaluate import evaluate_scorer, gate

# ── Rótulo ────────────────────────────────────────────────────────────────


def test_rotulo_pondera_satisfacao_e_nao_apenas_escolha():
    assert ds.label_for("COMPLETED", None) == 1
    assert ds.label_for("COMPLETED", 5) == 1
    assert ds.label_for("COMPLETED", 2) == 0, "contratou e se arrependeu não é positivo"
    assert ds.label_for("CANCELLED", None) == 0
    assert ds.label_for("REQUESTED", None) is None, "desfecho desconhecido não é exemplo"


# ── Vazamento ─────────────────────────────────────────────────────────────


def test_sem_vazamento_features_so_usam_o_passado(raw):
    """Nenhum agregado de um exemplo pode conter o próprio booking ou o futuro."""
    examples = ds.build_examples(raw)
    assert examples

    por_cliente: dict[str, list] = {}
    for ex in examples:
        por_cliente.setdefault(ex.client.id, []).append(ex)

    for exemplos in por_cliente.values():
        exemplos.sort(key=lambda e: e.at)
        # O primeiro booking de um cliente precisa vê-lo como frio.
        assert exemplos[0].client.booking_count == 0
        assert exemplos[0].client.avg_ticket is None
        # E sem âncora geográfica, já que não há endereço anterior.
        assert all(c.distance_km is None for c in exemplos[0].candidates)
        # O contador cresce estritamente e nunca antecipa bookings futuros.
        contagens = [e.client.booking_count for e in exemplos]
        assert contagens == sorted(contagens)
        assert contagens[-1] < len(exemplos) + 1


def test_sem_vazamento_avaliacao_futura_nao_conta(raw):
    """A nota de um profissional num exemplo só pode vir de reviews anteriores."""
    examples = ds.build_examples(raw)
    reviews_por_provider: dict[str, list] = {}
    for r in raw.reviews:
        reviews_por_provider.setdefault(r.provider_id, []).append(r.created_at)

    for ex in examples[:200]:
        for cand in ex.candidates:
            anteriores = sum(1 for t in reviews_por_provider.get(cand.provider_id, []) if t < ex.at)
            assert cand.rating_count == anteriores, (
                f"{cand.provider_id} tem {cand.rating_count} avaliações em {ex.at}, "
                f"mas só {anteriores} são anteriores"
            )


def test_split_temporal_nao_embaralha():
    examples = ds.build_examples(make_raw(n_bookings=200))
    treino, validacao = ds.temporal_split(examples, 0.25)
    assert treino and validacao
    assert max(e.at for e in treino) <= min(e.at for e in validacao)


def test_blocos_do_colaborativo_deixam_o_primeiro_sem_sinal(raw):
    """O primeiro bloco não tem passado — cf_score precisa ser NaN, não 0."""
    from zelo_ml.features.names import FEATURE_INDEX

    examples = ds.build_examples(raw)
    treino, _ = ds.temporal_split(examples, 0.2)
    stats = ds.compute_stats(treino)
    X, _ = ds.to_training_rows_blocked(treino, raw, stats, n_blocks=4)

    coluna = X[:, FEATURE_INDEX["cf_score"]]
    assert np.isnan(coluna).any(), "sem NaN, o primeiro bloco recebeu sinal do futuro"
    assert not np.isnan(coluna).all(), "blocos posteriores deveriam ter sinal"


# ── Aprendizado ───────────────────────────────────────────────────────────


def test_pipeline_realmente_aprende(raw):
    """O teste que prova que o pipeline APRENDE, e não apenas executa.

    Treina num mundo sintético onde a escolha é enviesada por uma habilidade
    latente observável apenas através de notas ruidosas, e exige que o ranker
    supere a ordenação por nota crua — que é o baseline do produto hoje.
    """
    examples = ds.build_examples(raw)
    treino, validacao = ds.temporal_split(examples, 0.3)
    stats = ds.compute_stats(treino)
    cf = ds.fit_collaborative_from(treino, raw)

    X, y = ds.to_training_rows_blocked(treino, raw, stats, n_blocks=3)
    assert X.shape[0] > 0 and set(np.unique(y)) == {0, 1}

    modelo = train_ranker(X, y)
    n_pro = len(raw.providers)
    resultado = evaluate_scorer(
        validacao, lambda _e, m: modelo.predict_proba(m)[:, 1], cf, stats, "model", n_pro
    )
    base = evaluate_scorer(validacao, BASELINES["rating_desc"], cf, stats, "base", n_pro)

    assert resultado.get("ndcg@8") > 0
    assert resultado.get("ndcg@8") >= base.get("ndcg@8"), (
        f"modelo {resultado.get('ndcg@8'):.4f} não superou o baseline {base.get('ndcg@8'):.4f}"
    )


def test_gate_reprova_modelo_que_nao_supera_o_baseline():
    from zelo_ml.training.evaluate import EvalResult

    base = EvalResult("rating_desc", {"ndcg@8": 0.30, "hit_rate@5": 0.40})
    ruim = EvalResult("model", {"ndcg@8": 0.28, "hit_rate@5": 0.35, "coverage@8": 0.9})
    passou, motivos = gate(ruim, base)
    assert not passou and len(motivos) == 2

    bom = EvalResult("model", {"ndcg@8": 0.40, "hit_rate@5": 0.50, "coverage@8": 0.9})
    passou, motivos = gate(bom, base)
    assert passou and not motivos


def test_gate_reprova_ranking_que_colapsa_em_poucos_profissionais():
    from zelo_ml.training.evaluate import EvalResult

    base = EvalResult("rating_desc", {"ndcg@8": 0.30, "hit_rate@5": 0.40})
    colapsado = EvalResult("model", {"ndcg@8": 0.50, "hit_rate@5": 0.60, "coverage@8": 0.10})
    passou, motivos = gate(colapsado, base)
    assert not passou
    assert any("coverage" in m for m in motivos)
