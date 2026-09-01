"""Aplicação FastAPI."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Histogram, generate_latest

from ..logging import configure_logging
from ..settings import settings
from .deps import registry
from .routes import health, model, rank

logger = logging.getLogger(__name__)

# Definido no nível do módulo (não por create_app) para não registrar a mesma série duas
# vezes quando os testes criam vários apps. O rótulo `path` usa a ROTA casada, não a URL.
_http_duration = Histogram(
    "http_request_duration_seconds",
    "Duração das requisições HTTP",
    ["method", "path", "status"],
)


async def _poll_artifact() -> None:
    """Repolla o artefato ativo, para ativar um modelo novo sem redeploy."""
    while True:
        await asyncio.sleep(settings.model_poll_seconds)
        try:
            await asyncio.to_thread(registry.reload)
        except Exception:  # pragma: no cover - o loop não pode morrer
            logger.exception("polling do artefato falhou")


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)
    registry.reload()
    if registry.bundle is None:
        logger.warning(
            "nenhum artefato ativo — servindo ranking heurístico "
            "(rode `python -m zelo_ml.training.train`)"
        )
    task = asyncio.create_task(_poll_artifact())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    app = FastAPI(
        title="ZELO — serviço de recomendação",
        version="1.0.0",
        lifespan=lifespan,
        # O serviço é interno (só o backend Node fala com ele). Sem docs
        # públicas: o contrato versionado vive em `contracts/rank.schema.json`.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.include_router(health.router)
    app.include_router(rank.router)
    app.include_router(model.router)

    @app.middleware("http")
    async def _metrics_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        started = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        path = getattr(route, "path", "unknown")
        _http_duration.labels(request.method, path, str(response.status_code)).observe(
            time.perf_counter() - started
        )
        return response

    # /metrics para o Prometheus — o terceiro serviço no painel do Grafana, ao lado do
    # backend e do de notificações.
    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
