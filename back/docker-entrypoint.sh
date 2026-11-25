#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Prepara o banco antes de entregar o processo ao CMD.
#
#   1. aplica as migrações (inclusive `CREATE EXTENSION postgis`);
#   2. popula o banco conforme SEED_ON_START.
#
# SEED_ON_START:
#   auto  (padrão)  semeia só quando o banco está vazio — reiniciar o contêiner
#                   não apaga o que você criou usando o app;
#   force           semeia sempre. DESTRUTIVO: o seed limpa todas as tabelas;
#   off             não semeia.
# ─────────────────────────────────────────────────────────────────────────────
set -e

PRISMA="./node_modules/.bin/prisma"
TSX="./node_modules/.bin/tsx"

# O compose já espera o healthcheck do Postgres, mas a primeira migração ainda
# pode pegar o banco no meio da inicialização — daí a repetição.
echo "› aplicando migrações..."
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

should_seed() {
  case "${SEED_ON_START:-auto}" in
    off|false|no)
      echo "› seed desativado (SEED_ON_START=${SEED_ON_START})"
      return 1
      ;;
    force|always)
      echo "› SEED_ON_START=force — repopulando (isto apaga os dados atuais)"
      return 0
      ;;
    *)
      # Sai 0 quando não há categoria nenhuma, ou seja, banco recém-criado.
      if node -e "
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        prisma.category.count()
          .then((n) => process.exit(n > 0 ? 1 : 0))
          .catch(() => process.exit(1))
          .finally(() => prisma.\$disconnect());
      "; then
        echo "› banco vazio — populando com o seed de demonstração"
        return 0
      fi
      echo "› banco já populado — pulando o seed (use SEED_ON_START=force para refazer)"
      return 1
      ;;
  esac
}

if should_seed; then
  "$TSX" prisma/seed.ts
fi

echo "› iniciando a API"
exec "$@"
