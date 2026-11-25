"""Registro do modelo em memória e autenticação do serviço."""

from __future__ import annotations

import logging
import secrets
import time

from fastapi import Header, HTTPException, status

from ..model.artifact import (
    IncompatibleArtifactError,
    ModelBundle,
    load_from_db,
    load_from_file,
)
from ..settings import settings

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Guarda o bundle ativo.

    Ausência de modelo NÃO é erro: é o estado inicial legítimo de um deploy novo
    ou de um banco recém-criado. Nesse caso o serviço responde 200 com a
    estratégia heurística. Quem decide se isso é aceitável é o produto, não a
    camada de infraestrutura.
    """

    def __init__(self) -> None:
        self._bundle: ModelBundle | None = None
        self._loaded_at: float | None = None
        self.started_at = time.monotonic()

    @property
    def bundle(self) -> ModelBundle | None:
        return self._bundle

    @property
    def version(self) -> str | None:
        return self._bundle.version if self._bundle else None

    def uptime_seconds(self) -> float:
        return round(time.monotonic() - self.started_at, 3)

    def reload(self) -> bool:
        """Recarrega o artefato ativo. Devolve True se algo mudou."""
        try:
            bundle = (
                load_from_db(settings.database_url)
                if settings.artifact_backend == "db" and settings.database_url
                else load_from_file(settings.artifact_dir)
            )
        except IncompatibleArtifactError as exc:
            # Recusa explícita: melhor servir a heurística do que pontuar com
            # features desalinhadas e produzir um ranking silenciosamente errado.
            logger.error("artefato recusado: %s", exc)
            self._bundle = None
            return True
        except Exception:
            logger.exception("falha ao carregar artefato; mantendo o modelo atual")
            return False

        if bundle is None:
            changed = self._bundle is not None
            self._bundle = None
            return changed

        changed = self._bundle is None or self._bundle.version != bundle.version
        self._bundle = bundle
        self._loaded_at = time.time()
        if changed:
            logger.info("modelo carregado: versão=%s", bundle.version)
        return changed


registry = ModelRegistry()


def require_token(x_ml_token: str | None = Header(default=None)) -> None:
    """Compara em tempo constante para não vazar o token por timing."""
    expected = settings.service_token
    if not x_ml_token or not secrets.compare_digest(x_ml_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="token de serviço inválido"
        )
