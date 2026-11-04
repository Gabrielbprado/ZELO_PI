#!/usr/bin/env bash
# Backup do Postgres do ZELO — pg_dump + upload opcional para S3/B2.
#
# Uso local:
#   DATABASE_URL="postgresql://..." ./scripts/backup-postgres.sh
#
# Uso em CI/cron (upload para S3):
#   DATABASE_URL=... BACKUP_S3_BUCKET=zelo-backups AWS_* definidos
#   ./scripts/backup-postgres.sh
#
# Pré-requisitos: pg_dump 16 (combina com postgis/postgis:16-3.4), awscli opcional.
# Saída: arquivo .dump (formato custom do pg_dump) + .sha256.
#
# NÃO destrói nada. Idempotente. Seguro de rodar a qualquer hora.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL obrigatório}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_LOCAL_DAYS="${RETENTION_LOCAL_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$BACKUP_DIR/zelo-${TIMESTAMP}.dump"
HASH_FILE="$DUMP_FILE.sha256"

echo "[backup] iniciando pg_dump → $DUMP_FILE"
# -Fc = formato custom (comprimido, restaurável com pg_restore).
# --no-owner e --no-acl: o restore na máquina destino usa o owner local.
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file "$DUMP_FILE"

sha256sum "$DUMP_FILE" | awk '{print $1}' > "$HASH_FILE"
SIZE=$(wc -c < "$DUMP_FILE")
echo "[backup] concluído: ${SIZE} bytes, sha256=$(cat "$HASH_FILE")"

# Upload opcional. Se BACKUP_S3_BUCKET não estiver definido, o script só deixa o
# arquivo local (útil em desenvolvimento ou snapshot pontual).
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  : "${AWS_ACCESS_KEY_ID:?credenciais S3 ausentes}"
  : "${AWS_SECRET_ACCESS_KEY:?credenciais S3 ausentes}"
  echo "[backup] enviando para s3://${BACKUP_S3_BUCKET}/"
  aws s3 cp "$DUMP_FILE" "s3://${BACKUP_S3_BUCKET}/$(basename "$DUMP_FILE")" \
    --storage-class STANDARD_IA
  aws s3 cp "$HASH_FILE" "s3://${BACKUP_S3_BUCKET}/$(basename "$HASH_FILE")"
fi

# Expurgo local de dumps antigos. O bucket remoto tem lifecycle próprio.
find "$BACKUP_DIR" -name 'zelo-*.dump' -type f -mtime "+${RETENTION_LOCAL_DAYS}" -delete || true
find "$BACKUP_DIR" -name 'zelo-*.dump.sha256' -type f -mtime "+${RETENTION_LOCAL_DAYS}" -delete || true

echo "[backup] ok"
