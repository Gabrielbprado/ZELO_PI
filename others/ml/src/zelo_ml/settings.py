"""Configuração via ambiente."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ML_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_", env_file=".env", extra="ignore")

    #: Token compartilhado com o backend Node. O payload carrega userId e
    #: coordenadas — o serviço não fica aberto na internet sem autenticação.
    service_token: str = "local_dev_ml_token_change_me_please"

    #: `file` em dev; `db` no Render, onde o filesystem é efêmero.
    artifact_backend: Literal["file", "db"] = "file"
    artifact_dir: Path = REPO_ML_DIR / "artifacts"
    reports_dir: Path = REPO_ML_DIR / "reports"

    #: DSN somente-leitura para treino e para o backend `db`.
    database_url: str | None = None

    #: Repolling do artefato: permite ativar um modelo novo sem redeploy.
    model_poll_seconds: int = 300

    exploration_ratio: float = 0.12
    random_seed: int = 42
    log_level: str = "INFO"


settings = Settings()
