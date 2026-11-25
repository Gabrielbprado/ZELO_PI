"""Endpoint de moderação de denúncias."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from ...moderation import classify
from ..deps import require_token
from ..schemas import ModerateRequest, ModerateResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["moderation"], dependencies=[Depends(require_token)])


@router.post("/moderate", response_model=ModerateResponse)
def moderate_report(request: ModerateRequest) -> ModerateResponse:
    result = classify(request)
    # Só o veredito e metadados — NUNCA o texto denunciado. O log é o lugar mais fácil
    # de vazar o conteúdo que o endpoint existe para tratar com cuidado.
    logger.info(
        "denúncia classificada",
        extra={
            "extra_fields": {
                "report_id": request.report_id,
                "target_type": request.target_type,
                "category": result.category,
                "severity": result.severity,
                "priority": result.priority,
                "confidence": result.confidence,
                "action": result.action,
                "auto_enforce": result.auto_enforce,
                "latency_ms": result.latency_ms,
            }
        },
    )
    return result
