"""Endpoint de ranking."""

from __future__ import annotations

import logging
import random
import time

from fastapi import APIRouter, Depends

from ...model.pipeline import rank as run_rank
from ...settings import settings
from ..deps import registry, require_token
from ..schemas import RankRequest, RankResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["rank"], dependencies=[Depends(require_token)])


@router.post("/rank", response_model=RankResponse)
def rank_providers(request: RankRequest) -> RankResponse:
    started = time.perf_counter()
    bundle = registry.bundle

    items, strategy = run_rank(
        request,
        bundle,
        exploration_ratio=settings.exploration_ratio,
        rng=random.Random(f"{request.request_id}:{settings.random_seed}"),
    )

    latency_ms = round((time.perf_counter() - started) * 1000, 3)
    # Só contagens e metadados — nunca o corpo (contém userId e coordenadas).
    logger.info(
        "rank concluído",
        extra={
            "extra_fields": {
                "candidates": len(request.candidates),
                "returned": len(items),
                "strategy": strategy,
                "model_version": bundle.version if bundle else None,
                "latency_ms": latency_ms,
            }
        },
    )
    return RankResponse(
        model_version=bundle.version if bundle else None,
        strategy=strategy,
        latency_ms=latency_ms,
        items=items,
    )
