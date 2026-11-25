"""Logging estruturado.

Regra: NUNCA logar corpo de requisição. O payload de ranking carrega o id do
usuário e as coordenadas dele; um log verboso viraria um rastro de localização
persistido. Logamos apenas contagens, latências e a versão do modelo.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in getattr(record, "extra_fields", {}).items():
            payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # Uvicorn duplica mensagens de acesso que já contêm a URL completa.
    logging.getLogger("uvicorn.access").disabled = True
