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


def _dump_schema() -> str:
    """Gera o JSON Schema versionado em `contracts/rank.schema.json`.

    O CI regenera e roda `git diff --exit-code`: se alguém mudar o contrato sem
    atualizar o arquivo, o build quebra antes de o Node e o Python divergirem em
    produção.
    """
    return json.dumps(
        {
            "request": RankRequest.model_json_schema(),
            "response": RankResponse.model_json_schema(),
        },
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )


if __name__ == "__main__":  # pragma: no cover - utilitário de build
    print(_dump_schema())
