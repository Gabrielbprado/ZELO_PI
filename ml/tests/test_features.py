"""Contrato de features, suavização bayesiana e transformações geográficas."""

from __future__ import annotations

import math

import numpy as np
import pytest
from tests.conftest import make_candidate, make_request

from zelo_ml.features.bayes import bayesian_rating, beta_smoothed_rate
from zelo_ml.features.builders import build_feature_matrix
from zelo_ml.features.geo import geo_decay, rank_percentile
from zelo_ml.features.names import (
    FEATURE_NAMES,
    N_FEATURES,
    NULLABLE_FEATURES,
    monotonic_constraints,
)

# ── Prior bayesiano ───────────────────────────────────────────────────────


def test_sem_avaliacao_recebe_media_global_e_nao_zero():
    """O bug que motivou a feature: ratingAvg default 0.0 afunda quem é novo."""
    assert bayesian_rating(0.0, 0, global_mean=4.2) == 4.2


def test_uma_nota_cinco_nao_vira_cinco():
    assert bayesian_rating(5.0, 1, global_mean=4.2) < 4.4


def test_converge_para_a_media_real_com_volume():
    assert bayesian_rating(5.0, 1000, global_mean=4.2) > 4.9


def test_monotonico_na_nota():
    anterior = -math.inf
    for avg in (1.0, 2.0, 3.0, 4.0, 5.0):
        atual = bayesian_rating(avg, 20, global_mean=4.2)
        assert atual > anterior
        anterior = atual


def test_taxa_beta_penaliza_amostra_pequena():
    # "1 de 1" não pode ganhar de "180 de 200".
    assert beta_smoothed_rate(1, 1) < beta_smoothed_rate(180, 200)


# ── Geografia ─────────────────────────────────────────────────────────────


def test_decaimento_no_intervalo_e_estritamente_decrescente():
    assert geo_decay(0.0) == 1.0
    valores = [geo_decay(d) for d in (0.0, 1.0, 3.0, 10.0, 40.0)]
    assert all(0.0 < v <= 1.0 for v in valores)
    assert valores == sorted(valores, reverse=True)


def test_sem_distancia_permanece_indefinido():
    """NaN entra, NaN sai: inventar 0 ou 999 enviesaria o ranking."""
    assert math.isnan(geo_decay(None))
    assert math.isnan(geo_decay(float("nan")))


def test_percentil_preserva_nan_e_ordem():
    pct = rank_percentile([10.0, math.nan, 30.0, 20.0], higher_is_better=True)
    assert math.isnan(pct[1])
    assert pct[2] == 1.0  # maior valor
    assert pct[0] == 0.0  # menor valor
    assert 0.0 < pct[3] < 1.0


def test_percentil_lista_vazia_e_unitaria():
    assert rank_percentile([], higher_is_better=True) == []
    assert rank_percentile([5.0], higher_is_better=True) == [1.0]


# ── Contrato da matriz ────────────────────────────────────────────────────


def test_nomes_de_features_sao_um_snapshot():
    """Reordenar ou renomear invalida todo artefato já treinado.

    Se este teste quebrar, a mudança é intencional? Então acrescente a feature no
    FIM da tupla, retreine, e atualize o número abaixo.
    """
    assert N_FEATURES == 47
    assert len(set(FEATURE_NAMES)) == N_FEATURES, "nome de feature duplicado"
    assert FEATURE_NAMES[0] == "p_rating_bayes"
    assert FEATURE_NAMES[-1] == "p_has_reviews"


def test_restricoes_de_monotonicidade_alinhadas():
    cst = monotonic_constraints()
    assert len(cst) == N_FEATURES
    assert set(cst) <= {-1, 0, 1}
    idx = {n: i for i, n in enumerate(FEATURE_NAMES)}
    assert cst[idx["geo_distance_km"]] == -1, "mais longe nunca pode melhorar o score"
    assert cst[idx["p_rating_bayes"]] == 1


def test_matriz_tem_forma_do_contrato():
    req = make_request(n=6)
    m = build_feature_matrix(req.client, req.context, req.candidates)
    assert m.shape == (6, N_FEATURES)
    assert m.dtype == np.float64


def test_nan_apenas_em_colunas_permitidas():
    """NaN fora da whitelist é bug de cálculo, não ausência de informação."""
    req = make_request(n=4)
    m = build_feature_matrix(req.client, req.context, req.candidates)
    for i, name in enumerate(FEATURE_NAMES):
        if name in NULLABLE_FEATURES:
            continue
        assert not np.isnan(m[:, i]).any(), f"NaN inesperado em {name}"


def test_cliente_frio_produz_nan_e_nao_zero():
    """Cliente sem histórico não tem encaixe de preço — isso é indefinido."""
    req = make_request(n=3, booking_count=0, avg_ticket=None, category_counts={})
    m = build_feature_matrix(req.client, req.context, req.candidates)
    idx = {n: i for i, n in enumerate(FEATURE_NAMES)}
    assert np.isnan(m[:, idx["price_band_fit"]]).all()
    assert (m[:, idx["c_is_cold"]] == 1.0).all()


def test_sem_ancora_geografica_distancia_fica_nan():
    req = make_request(n=3)
    for c in req.candidates:
        c.distance_km = None
    m = build_feature_matrix(req.client, req.context, req.candidates)
    idx = {n: i for i, n in enumerate(FEATURE_NAMES)}
    assert np.isnan(m[:, idx["geo_distance_km"]]).all()
    assert np.isnan(m[:, idx["geo_decay"]]).all()


def test_matriz_vazia_nao_quebra():
    req = make_request(n=1)
    m = build_feature_matrix(req.client, req.context, [])
    assert m.shape == (0, N_FEATURES)


@pytest.mark.parametrize("preco,esperado_maior", [(200.0, True), (2000.0, False)])
def test_encaixe_de_preco_reflete_ticket_do_cliente(preco, esperado_maior):
    req = make_request(n=1)
    req.candidates = [make_candidate(price_from=preco)]
    m = build_feature_matrix(req.client, req.context, req.candidates)
    idx = FEATURE_NAMES.index("price_band_fit")
    # avg_ticket do cliente é 200. `bool(...)` porque numpy devolve np.bool_.
    assert bool(m[0, idx] > 0.8) is esperado_maior
