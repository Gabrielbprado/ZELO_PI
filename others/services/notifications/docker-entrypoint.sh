#!/bin/sh
# Aplica as migrations no schema `notifications` e então entrega o processo ao CMD.
# Repete enquanto o Postgres ainda estiver subindo.
set -e

PRISMA="./node_modules/.bin/prisma"

echo "› aplicando migrations (schema notifications)..."
attempt=1
until "$PRISMA" migrate deploy; do
  if [ "$attempt" -ge 20 ]; then
    echo "✗ banco indisponível depois de $attempt tentativas" >&2
    exit 1
  fi
  echo "  banco ainda não respondeu (tentativa $attempt), aguardando..."
  attempt=$((attempt + 1))
  sleep 3
done

echo "› iniciando o serviço de notificações"
exec "$@"
