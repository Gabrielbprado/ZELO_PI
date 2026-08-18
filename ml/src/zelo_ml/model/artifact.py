"""Serialização, versionamento e carregamento do modelo.

Regra central: um artefato cuja lista de features não bate exatamente com o
código em execução é RECUSADO, não adaptado. Pontuar com features desalinhadas
produziria um ranking silenciosamente errado — o pior tipo de falha, porque
parece estar funcionando.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib

from ..features.builders import GlobalStats
from ..features.names import FEATURE_NAMES
from .collaborative import CollaborativeModel

logger = logging.getLogger(__name__)

#: Incrementar quando a ESTRUTURA do bundle mudar (não a cada retreino).
SCHEMA_VERSION = 1

#: Guarda contra carregar um blob absurdo do banco para a memória do dyno.
MAX_ARTIFACT_BYTES = 16_000_000


class IncompatibleArtifactError(RuntimeError):
    """Artefato existe, mas não é utilizável por esta versão do código."""


@dataclass
class ModelBundle:
    version: str
    ranker: Any
    collaborative: CollaborativeModel
    stats: GlobalStats
    feature_names: tuple[str, ...] = FEATURE_NAMES
    schema_version: int = SCHEMA_VERSION
    trained_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    metrics: dict[str, float] = field(default_factory=dict)

    def validate(self) -> None:
        if self.schema_version != SCHEMA_VERSION:
            raise IncompatibleArtifactError(
                f"schema_version {self.schema_version} != {SCHEMA_VERSION} esperado"
            )
        if tuple(self.feature_names) != FEATURE_NAMES:
            missing = set(FEATURE_NAMES) - set(self.feature_names)
            extra = set(self.feature_names) - set(FEATURE_NAMES)
            raise IncompatibleArtifactError(
                "lista de features divergente "
                f"(faltando={sorted(missing)}, sobrando={sorted(extra)}); retreine o modelo"
            )


def make_version(git_sha: str | None = None) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"{stamp}-{git_sha}" if git_sha else stamp


def to_bytes(bundle: ModelBundle) -> bytes:
    bundle.validate()
    buffer = io.BytesIO()
    joblib.dump(bundle, buffer, compress=3)
    return buffer.getvalue()


def from_bytes(blob: bytes) -> ModelBundle:
    if len(blob) > MAX_ARTIFACT_BYTES:
        raise IncompatibleArtifactError(
            f"artefato de {len(blob)} bytes excede o limite de {MAX_ARTIFACT_BYTES}"
        )
    bundle = joblib.load(io.BytesIO(blob))
    if not isinstance(bundle, ModelBundle):
        raise IncompatibleArtifactError(f"tipo inesperado no artefato: {type(bundle)!r}")
    bundle.validate()
    return bundle


# ── Backend: arquivo ──────────────────────────────────────────────────────


def save_to_file(bundle: ModelBundle, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"model-{bundle.version}.joblib"
    path.write_bytes(to_bytes(bundle))
    # Ponteiro para a versão ativa: um arquivo texto simples evita ter de
    # ordenar nomes por data (que quebraria com fuso ou renomeação manual).
    (directory / "latest.txt").write_text(path.name, encoding="utf-8")
    return path


def load_from_file(directory: Path) -> ModelBundle | None:
    pointer = directory / "latest.txt"
    if not pointer.exists():
        return None
    target = directory / pointer.read_text(encoding="utf-8").strip()
    if not target.exists():
        logger.warning("latest.txt aponta para %s, que não existe", target.name)
        return None
    return from_bytes(target.read_bytes())


# ── Backend: banco ────────────────────────────────────────────────────────
#
# No Render free o filesystem é efêmero e não há disco persistente: um artefato
# gravado pelo job de treino não sobreviveria ao redeploy nem seria visível ao
# web service. O blob mora na tabela `MlModelArtifact`, cujo schema continua
# sendo do Prisma — o Python só faz SELECT/INSERT/UPDATE.


def save_to_db(bundle: ModelBundle, dsn: str, activate: bool = False) -> None:
    import psycopg

    blob = to_bytes(bundle)
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "MlModelArtifact" ("id", "version", "blob", "metrics",
                                           "featureNames", "isActive", "createdAt")
            VALUES (gen_random_uuid()::text, %s, %s, %s::jsonb, %s::jsonb, %s, now())
            ON CONFLICT ("version") DO UPDATE
              SET "blob" = EXCLUDED."blob",
                  "metrics" = EXCLUDED."metrics",
                  "featureNames" = EXCLUDED."featureNames"
            """,
            (
                bundle.version,
                blob,
                _json(bundle.metrics),
                _json(list(bundle.feature_names)),
                activate,
            ),
        )
        if activate:
            cur.execute(
                'UPDATE "MlModelArtifact" SET "isActive" = ("version" = %s)',
                (bundle.version,),
            )
        conn.commit()


def activate_in_db(version: str, dsn: str) -> None:
    import psycopg

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute('SELECT 1 FROM "MlModelArtifact" WHERE "version" = %s', (version,))
        if cur.fetchone() is None:
            raise IncompatibleArtifactError(f"versão {version} não existe no banco")
        cur.execute('UPDATE "MlModelArtifact" SET "isActive" = ("version" = %s)', (version,))
        conn.commit()


def load_from_db(dsn: str) -> ModelBundle | None:
    import psycopg

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT "blob" FROM "MlModelArtifact" WHERE "isActive" = true '
            'ORDER BY "createdAt" DESC LIMIT 1'
        )
        row = cur.fetchone()
    if row is None:
        return None
    return from_bytes(bytes(row[0]))


def _json(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)
