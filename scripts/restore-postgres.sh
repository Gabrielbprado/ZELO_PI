#!/usr/bin/env bash
# Restore validado do Postgres — carrega um .dump em um banco-alvo.
#
# Uso típico (ambiente de validação, NUNCA produção direto):
#   DATABASE_URL="postgresql://user:pass@localhost:5432/zelo_restore_test" \
#     ./scripts/restore-postgres.sh ./backups/zelo-20261104T030000Z.dump
#
# Antes de rodar em qualquer banco: confirme com `psql $DATABASE_URL -c '\dt'` que
# ele está vazio. pg_restore NÃO limpa o schema antes — ele acumula.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL obrigatório}"
DUMP_FILE="${1:?uso: $0 <arquivo.dump>}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "[restore] arquivo não encontrado: $DUMP_FILE" >&2
  exit 1
fi

HASH_FILE="${DUMP_FILE}.sha256"
if [[ -f "$HASH_FILE" ]]; then
  EXPECTED=$(cat "$HASH_FILE")
  ACTUAL=$(sha256sum "$DUMP_FILE" | awk '{print $1}')
  if [[ "$EXPECTED" != "$ACTUAL" ]]; then
    echo "[restore] HASH NÃO BATE — dump corrompido ou adulterado" >&2
    echo "  esperado: $EXPECTED" >&2
    echo "  obtido:   $ACTUAL" >&2
    exit 2
  fi
  echo "[restore] hash OK"
else
  echo "[restore] AVISO: sha256 ausente — pulando verificação de integridade"
fi

echo "[restore] restaurando $DUMP_FILE em $DATABASE_URL"
# --clean dropa objetos antes de recriar; --if-exists evita falhas na primeira passada.
# -j 4 = paralelismo moderado. Ajuste pra CPU disponível.
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --jobs 4 \
  "$DUMP_FILE"

echo "[restore] concluído. Valide com:"
echo "  psql \$DATABASE_URL -c 'SELECT COUNT(*) FROM \"User\";'"
echo "  psql \$DATABASE_URL -c 'SELECT COUNT(*) FROM \"Booking\";'"
