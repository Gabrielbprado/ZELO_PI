"""Liveness e readiness. Nenhum dos dois toca no banco."""

from __future__ import annotations

from fastapi import APIRouter

from ...api.schemas import HealthResponse
from ..deps import registry

router = APIRouter(tags=["health"])


def _strategy() -> str:
    return "ranker" if registry.bundle else "heuristic_fallback"


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model_version=registry.version,
        strategy=_strategy(),  # type: ignore[arg-type]
        uptime_seconds=registry.uptime_seconds(),
    )


@router.get("/ready", response_model=HealthResponse)
def ready() -> HealthResponse:
    # Pronto mesmo sem modelo: a heurística é um caminho de serviço válido, e
    # marcar o pod como não-pronto só porque o treino ainda não rodou tiraria do
    # ar um serviço perfeitamente capaz de responder.
    return health()
