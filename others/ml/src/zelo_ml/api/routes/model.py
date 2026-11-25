"""Metadados e recarga do modelo."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ...features.names import N_FEATURES
from ..deps import registry, require_token
from ..schemas import ModelInfo

router = APIRouter(prefix="/v1", tags=["model"], dependencies=[Depends(require_token)])


@router.get("/model", response_model=ModelInfo)
def model_info() -> ModelInfo:
    bundle = registry.bundle
    return ModelInfo(
        model_version=bundle.version if bundle else None,
        strategy="ranker" if bundle else "heuristic_fallback",
        trained_at=bundle.trained_at if bundle else None,
        feature_count=N_FEATURES,
        metrics=bundle.metrics if bundle else {},
    )


@router.post("/model/reload", response_model=ModelInfo)
def reload_model() -> ModelInfo:
    """Ativa um artefato novo sem reiniciar o processo.

    Chamado pelo workflow de retreino depois que o gate de avaliação passa.
    """
    registry.reload()
    return model_info()
