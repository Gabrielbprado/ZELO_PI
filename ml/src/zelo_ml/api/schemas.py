"""Contrato HTTP do serviço de ranking.

Estes modelos são a ÚNICA representação de um exemplo — o treino constrói
exatamente os mesmos objetos a partir do banco (ponto-a-ponto no tempo) e o
serving os recebe do Node. Uma representação só elimina, por construção, o modo
de falha clássico de sistemas de ML: features calculadas de um jeito no treino
e de outro na inferência.

O payload carrega apenas ids e números. Nome, e-mail, telefone e endereço nunca
cruzam a fronteira para o serviço Python.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MAX_CANDIDATES = 200

Strategy = Literal["ranker", "cold_start_popularity", "heuristic_fallback"]

ReasonCode = Literal[
    "REHIRE",
    "SAME_CATEGORY_HISTORY",
    "NEARBY",
    "TOP_RATED",
    "SIMILAR_CLIENTS",
    "PRICE_FIT",
    "VERIFIED",
    "FAST_RESPONSE",
    "NEW_TALENT",
]

URGENCY_ORDINAL: dict[str, int] = {
    "FLEXIBLE": 0,
    "THIS_WEEK": 1,
    "TODAY": 2,
    "EMERGENCY": 3,
}


class ClientProfile(BaseModel):
    """Agregados do cliente. Tudo derivável de um único groupBy no Node."""

    id: str | None = None
    city: str | None = None
    neighborhood: str | None = None
    booking_count: int = 0
    distinct_categories: int = 0
    avg_ticket: float | None = None
    days_since_last_booking: float | None = None
    #: categoria → nº de bookings do cliente naquela categoria.
    category_counts: dict[str, int] = Field(default_factory=dict)


class Context(BaseModel):
    category_id: str | None = None
    urgency: str | None = None
    at: datetime
    limit: int = Field(default=8, ge=1, le=50)


class Candidate(BaseModel):
    """Um profissional candidato, já pré-filtrado pelo Postgres.

    `rating_avg`/`rating_count` são os contadores desnormalizados; o prior
    bayesiano é recalculado aqui e não confia no `ratingAvg` cru justamente
    porque ele vale 0.0 para quem nunca foi avaliado.
    """

    provider_id: str
    category_ids: list[str] = Field(default_factory=list)
    price_from: float = 0.0
    years_exp: int = 0
    jobs_done: int = 0
    rating_avg: float = 0.0
    rating_count: int = 0
    verified: bool = False
    available: bool = True
    tenure_days: float = 0.0
    distance_km: float | None = None
    same_neighborhood: bool = False
    same_city: bool = False
    completed_count: int = 0
    cancelled_count: int = 0
    accepted_count: int = 0
    requested_count: int = 0
    median_response_hours: float | None = None
    prior_bookings_with_client: int = 0
    prior_completed_with_client: int = 0
    days_since_last_with_client: float | None = None
    service_median_price: float | None = None


class RankRequest(BaseModel):
    request_id: str
    client: ClientProfile
    context: Context
    candidates: list[Candidate] = Field(min_length=0, max_length=MAX_CANDIDATES)


class Reason(BaseModel):
    code: ReasonCode
    #: Valor que justifica o código (km, nota, nº de contratações…). O texto em
    #: pt-BR é responsabilidade do Node — i18n mora numa camada só.
    value: float | None = None


class RankedItem(BaseModel):
    provider_id: str
    score: float
    rank: int
    reasons: list[Reason] = Field(default_factory=list)


class RankResponse(BaseModel):
    model_version: str | None
    strategy: Strategy
    latency_ms: float
    items: list[RankedItem]


class ModelInfo(BaseModel):
    model_version: str | None
    strategy: Strategy
    trained_at: datetime | None = None
    feature_count: int
    metrics: dict[str, float] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    model_version: str | None
    strategy: Strategy
    uptime_seconds: float


# ─── Moderação ───────────────────────────────────────────────────────────────
# Exceção CONSCIENTE à regra do topo deste arquivo ("só ids e números"): moderar é
# julgar TEXTO, então o texto denunciado precisa atravessar a fronteira — é o objeto
# da análise, não um enriquecimento. O que continua não atravessando: nome, e-mail,
# telefone e endereço de quem quer que seja. O serviço não persiste o payload e loga
# apenas contagens (mesma disciplina do /v1/rank).

ModerationCategory = Literal[
    "FRAUD", "SPAM", "INAPPROPRIATE", "HARASSMENT", "SAFETY", "OFF_PLATFORM", "NONE"
]
ModerationSeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
#: Ações que a IA pode SUGERIR. Aceitar/rejeitar uma denúncia é juízo humano sobre o
#: mérito; a máquina opina sobre a consequência.
ModerationAction = Literal["REQUEST_INFO", "REJECT", "WARN", "SUSPEND", "BLOCK"]

MAX_SAMPLES = 30


class ModerationContext(BaseModel):
    """Sinais comportamentais, só contagens. É o que permite ver PADRÃO onde uma
    denúncia isolada não mostra nada: três denunciantes distintos em 30 dias dizem
    mais sobre o alvo do que qualquer adjetivo no texto."""

    target_reports_30d: int = 0
    target_distinct_reporters_30d: int = 0
    target_prior_warnings: int = 0
    target_prior_suspensions: int = 0
    target_account_age_days: float = 0.0
    target_completed_bookings: int = 0
    target_kyc_verified: bool = False
    #: Denúncias que ESTE denunciante abriu nos últimos 7 dias. Alto = possível
    #: retaliação/denúncia em massa, e isso segura a mão da máquina.
    reporter_reports_7d: int = 0
    reporter_account_age_days: float = 0.0


class ModerateRequest(BaseModel):
    report_id: str
    #: Motivo escolhido pelo denunciante (enum `ReportReason` do Node).
    reason: str
    target_type: Literal["USER", "SERVICE", "CONVERSATION"] = "USER"
    #: Descrição escrita pelo denunciante.
    text: str = ""
    #: Trechos da entidade denunciada — mensagens do alvo na conversa, título e
    #: descrição do serviço. Vazio numa denúncia de perfil.
    samples: list[str] = Field(default_factory=list, max_length=MAX_SAMPLES)
    evidence_count: int = 0
    context: ModerationContext = Field(default_factory=ModerationContext)


class Signal(BaseModel):
    """Por que a máquina decidiu o que decidiu. Sem isto o admin teria que confiar
    num número, e moderador que não entende a máquina para de usá-la."""

    code: str
    weight: float
    detail: str | None = None


class ModerateResponse(BaseModel):
    model_version: str
    category: ModerationCategory
    severity: ModerationSeverity
    #: 0–100. É por ele que a fila do admin ordena.
    priority: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0.0, le=1.0)
    action: ModerationAction | None = None
    #: True → o Node APLICA a ação sozinho. False → ela é só sugestão na fila.
    auto_enforce: bool = False
    suspend_days: int | None = None
    signals: list[Signal] = Field(default_factory=list)
    latency_ms: float


_CONTRACTS: dict[str, tuple[type[BaseModel], type[BaseModel]]] = {
    "rank": (RankRequest, RankResponse),
    "moderate": (ModerateRequest, ModerateResponse),
}


def _dump_schema(name: str = "rank") -> str:
    """Gera o JSON Schema versionado em `contracts/<name>.schema.json`.

    O CI regenera e roda `git diff --exit-code`: se alguém mudar o contrato sem
    atualizar o arquivo, o build quebra antes de o Node e o Python divergirem em
    produção.
    """
    req, res = _CONTRACTS[name]
    return json.dumps(
        {"request": req.model_json_schema(), "response": res.model_json_schema()},
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )


if __name__ == "__main__":  # pragma: no cover - utilitário de build
    import sys

    print(_dump_schema(sys.argv[1] if len(sys.argv) > 1 else "rank"))
