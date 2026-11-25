"""Moderação: classificação, guarda-corpos do bloqueio automático e o endpoint.

Os testes que mais importam aqui não são os que provam que a IA acerta — são os que
provam que ela NÃO age sozinha quando não deveria. Um falso positivo do moderador
automático tira o sustento de um profissional.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from zelo_ml.api.main import create_app
from zelo_ml.api.schemas import ModerateRequest, ModerationContext
from zelo_ml.moderation import classify
from zelo_ml.settings import settings

TOKEN = {"X-ML-Token": settings.service_token}


def make_report(**overrides) -> ModerateRequest:
    ctx = ModerationContext(**overrides.pop("context", {}))
    defaults = {
        "report_id": "rep-1",
        "reason": "OTHER",
        "target_type": "USER",
        "text": "",
        "samples": [],
        "evidence_count": 0,
    }
    defaults.update(overrides)
    return ModerateRequest(context=ctx, **defaults)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "artifact_dir", tmp_path)
    with TestClient(create_app()) as c:
        yield c


# ─── Categorias ──────────────────────────────────────────────────────────────


def test_classifica_fraude_pelo_texto_mesmo_com_motivo_generico():
    r = classify(
        make_report(
            reason="OTHER", text="Pediu pagamento antecipado por PIX e sumiu com o dinheiro"
        )
    )
    assert r.category == "FRAUD"
    assert r.severity in ("HIGH", "CRITICAL")
    assert any(s.code == "LEXICON_FRAUD" for s in r.signals)


def test_classifica_spam_por_repeticao_sem_depender_de_vocabulario():
    r = classify(
        make_report(
            target_type="CONVERSATION",
            text="Fica mandando a mesma coisa sem parar",
            samples=["oi tem serviço?"] * 6,
        )
    )
    assert any(s.code == "REPEATED_MESSAGES" for s in r.signals)


def test_detecta_tentativa_de_levar_para_fora_da_plataforma():
    r = classify(
        make_report(
            target_type="CONVERSATION",
            text="Quis fechar por fora",
            samples=["me chama no whatsapp (11) 99999-8888 que a gente fecha sem passar pelo app"],
        )
    )
    assert r.category == "OFF_PLATFORM"
    assert {s.code for s in r.signals} & {"CONTACT_PHONE", "LEXICON_OFF_PLATFORM"}


def test_ameaca_e_critica():
    r = classify(
        make_report(reason="SAFETY", text="Ele me ameaçou e disse que vai me pegar na saída")
    )
    assert r.category == "SAFETY"
    assert r.severity == "CRITICAL"


def test_denuncia_sem_texto_pede_informacoes_em_vez_de_arquivar():
    r = classify(make_report(reason="OTHER", text=""))
    assert r.category == "NONE"
    assert r.action == "REQUEST_INFO"
    assert r.auto_enforce is False


# ─── Prioridade ──────────────────────────────────────────────────────────────


def test_prioridade_sobe_com_gravidade_e_corroboracao():
    leve = classify(make_report(text="Mandou propaganda, divulgação de link http://spam.com"))
    grave = classify(
        make_report(
            reason="SAFETY",
            text="Me agrediu e ameaçou",
            evidence_count=2,
            context={"target_distinct_reporters_30d": 3, "target_prior_suspensions": 1},
        )
    )
    assert grave.priority > leve.priority
    assert 0 <= leve.priority <= 100 and 0 <= grave.priority <= 100


# ─── Guarda-corpos do moderador automático ───────────────────────────────────


def test_nao_bloqueia_sozinho_com_um_unico_denunciante_e_sem_evidencia():
    r = classify(
        make_report(
            reason="SAFETY",
            text="Ele me ameaçou, me agrediu e invadiu minha casa com uma arma",
            context={"target_distinct_reporters_30d": 1},
        )
    )
    assert r.action == "BLOCK"
    assert r.auto_enforce is False, "bloqueio automático exige corroboração ou evidência"


def test_bloqueia_sozinho_com_denunciantes_distintos():
    r = classify(
        make_report(
            reason="SAFETY",
            text="Ele me ameaçou, me agrediu e invadiu minha casa com uma arma",
            evidence_count=1,
            context={
                "target_distinct_reporters_30d": 3,
                "target_prior_warnings": 2,
                "target_prior_suspensions": 1,
            },
        )
    )
    assert r.action == "BLOCK"
    assert r.auto_enforce is True
    assert r.confidence >= 0.85


def test_denunciante_em_massa_segura_a_mao_da_maquina():
    base = {
        "reason": "SAFETY",
        "text": "Ele me ameaçou, me agrediu e invadiu minha casa com uma arma",
        "evidence_count": 1,
    }
    normal = classify(
        make_report(
            **base, context={"target_distinct_reporters_30d": 3, "target_prior_suspensions": 1}
        )
    )
    retaliacao = classify(
        make_report(
            **base,
            context={
                "target_distinct_reporters_30d": 3,
                "target_prior_suspensions": 1,
                "reporter_reports_7d": 9,
            },
        )
    )
    assert normal.auto_enforce is True
    assert retaliacao.auto_enforce is False
    assert retaliacao.priority < normal.priority
    assert any(s.code == "MASS_REPORTER" for s in retaliacao.signals)


def test_nunca_arquiva_sozinho():
    """REJECT/REQUEST_INFO são juízo de mérito: a máquina nunca os aplica."""
    for text in ("", "não gostei do atendimento", "blá blá"):
        r = classify(make_report(text=text))
        assert r.action in (None, "REQUEST_INFO")
        assert r.auto_enforce is False


# ─── Endpoint ────────────────────────────────────────────────────────────────


def test_moderate_sem_token_e_401(client):
    r = client.post("/v1/moderate", json=make_report(text="golpe").model_dump(mode="json"))
    assert r.status_code == 401


def test_moderate_responde_no_contrato(client):
    r = client.post(
        "/v1/moderate",
        json=make_report(
            reason="FRAUD", text="Golpe: pediu depósito antecipado e sumiu"
        ).model_dump(mode="json"),
        headers=TOKEN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "FRAUD"
    assert set(body) >= {
        "model_version",
        "category",
        "severity",
        "priority",
        "confidence",
        "action",
        "auto_enforce",
        "signals",
    }
    assert body["model_version"].startswith("moderation-rules-")


def test_moderate_nao_quebra_com_payload_minimo(client):
    r = client.post("/v1/moderate", json={"report_id": "x", "reason": "OTHER"}, headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["category"] == "NONE"
