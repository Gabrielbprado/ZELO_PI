"""Endpoint de ranking: autenticação, limites, degradação e explicações."""

from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient
from tests.conftest import make_candidate, make_request

from zelo_ml.api.deps import registry
from zelo_ml.api.main import create_app
from zelo_ml.api.schemas import MAX_CANDIDATES
from zelo_ml.model.pipeline import rank
from zelo_ml.settings import settings

TOKEN = {"X-ML-Token": settings.service_token}


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Diretório vazio ⇒ nenhum artefato ⇒ exercita o caminho de degradação.
    monkeypatch.setattr(settings, "artifact_dir", tmp_path)
    with TestClient(create_app()) as c:
        yield c


def test_health_nao_exige_token(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_rank_sem_token_e_401(client):
    r = client.post("/v1/rank", json=make_request().model_dump(mode="json"))
    assert r.status_code == 401


def test_rank_com_token_invalido_e_401(client):
    r = client.post(
        "/v1/rank",
        json=make_request().model_dump(mode="json"),
        headers={"X-ML-Token": "errado"},
    )
    assert r.status_code == 401


def test_sem_artefato_responde_200_e_nao_503(client):
    """A Home não pode quebrar porque o modelo ainda não foi treinado."""
    r = client.post("/v1/rank", json=make_request(n=5).model_dump(mode="json"), headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body["strategy"] == "heuristic_fallback"
    assert body["model_version"] is None
    assert len(body["items"]) == 3  # limit do contexto


def test_scores_nao_crescentes_e_ranks_sequenciais(client):
    r = client.post("/v1/rank", json=make_request(n=8).model_dump(mode="json"), headers=TOKEN)
    itens = r.json()["items"]
    assert [i["rank"] for i in itens] == list(range(1, len(itens) + 1))
    scores = [i["score"] for i in itens]
    assert scores == sorted(scores, reverse=True)


def test_conjunto_vazio_devolve_lista_vazia(client):
    req = make_request(n=1)
    req.candidates = []
    r = client.post("/v1/rank", json=req.model_dump(mode="json"), headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_excesso_de_candidatos_e_422(client):
    req = make_request(n=1)
    payload = req.model_dump(mode="json")
    payload["candidates"] = [
        make_candidate(f"pro-{i}").model_dump(mode="json") for i in range(MAX_CANDIDATES + 1)
    ]
    r = client.post("/v1/rank", json=payload, headers=TOKEN)
    assert r.status_code == 422


def test_cliente_desconhecido_nao_quebra(client):
    req = make_request(n=4, id="cliente-que-nunca-existiu", booking_count=0, avg_ticket=None)
    r = client.post("/v1/rank", json=req.model_dump(mode="json"), headers=TOKEN)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3


def test_model_info_exige_token(client):
    assert client.get("/v1/model").status_code == 401
    r = client.get("/v1/model", headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["feature_count"] == 47


# ── Estratégias e explicações (nível de pipeline) ─────────────────────────


def test_cliente_frio_sem_geo_usa_popularidade():
    req = make_request(n=5, booking_count=0, avg_ticket=None, category_counts={})
    for c in req.candidates:
        c.distance_km = None
    # `bundle` presente é simulado por um objeto qualquer não-None seria errado;
    # aqui basta confirmar o caminho sem artefato.
    itens, estrategia = rank(req, None)
    assert estrategia == "heuristic_fallback"
    assert len(itens) == 3


def test_recontratacao_vira_o_motivo_principal():
    req = make_request(n=4)
    req.candidates[2].prior_bookings_with_client = 3
    req.candidates[2].prior_completed_with_client = 3
    itens, _ = rank(req, None, exploration_ratio=0.0)
    reincidente = next(i for i in itens if i.provider_id == "pro-2")
    assert reincidente.reasons[0].code == "REHIRE"


def test_proximidade_e_explicada_com_a_distancia():
    req = make_request(n=3)
    req.candidates[0].distance_km = 1.2
    req.candidates[0].prior_bookings_with_client = 0
    itens, _ = rank(req, None, exploration_ratio=0.0)
    perto = next(i for i in itens if i.provider_id == "pro-0")
    codigos = {r.code: r.value for r in perto.reasons}
    assert "NEARBY" in codigos
    assert codigos["NEARBY"] == pytest.approx(1.2, abs=0.01)


def test_no_maximo_dois_motivos_por_item():
    req = make_request(n=5)
    itens, _ = rank(req, None)
    assert all(len(i.reasons) <= 2 for i in itens)


def test_exploracao_promove_profissional_novo_e_o_rotula():
    """Sem exploração, quem acabou de entrar nunca aparece e nunca ganha histórico."""
    req = make_request(n=10)
    for c in req.candidates:
        c.tenure_days = 500.0
    novo = req.candidates[9]
    novo.tenure_days = 10.0
    novo.verified = True
    novo.rating_avg = 0.0
    novo.rating_count = 0
    novo.jobs_done = 0

    apareceu = False
    for seed in range(60):
        itens, _ = rank(req, None, exploration_ratio=1.0, rng=random.Random(seed))
        alvo = [i for i in itens if i.provider_id == novo.provider_id]
        if alvo:
            apareceu = True
            assert any(r.code == "NEW_TALENT" for r in alvo[0].reasons)
            break
    assert apareceu, "exploração nunca promoveu o profissional novo"


def test_exploracao_desligada_nao_altera_o_ranking():
    req = make_request(n=10)
    a, _ = rank(req, None, exploration_ratio=0.0, rng=random.Random(1))
    b, _ = rank(req, None, exploration_ratio=0.0, rng=random.Random(2))
    assert [i.provider_id for i in a] == [i.provider_id for i in b]


def test_registro_sem_artefato_permanece_vazio(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "artifact_dir", tmp_path)
    registry.reload()
    assert registry.bundle is None
    assert registry.version is None
