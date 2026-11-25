# Runbook — Aplicar `20261104130000_booking_travel` em staging

**Migration:** `backend/prisma/migrations/20261104130000_booking_travel/migration.sql`
**Natureza:** aditiva (CREATE TYPE + CREATE TABLE + CREATE INDEX + ADD CONSTRAINT). Reversível com `DROP TABLE "BookingTravel"; DROP TYPE "BookingTravelStatus";`.
**Pré-requisitos:** backup do banco de staging + confirmação explícita do ambiente.
**Produção:** NÃO aplicar sem ciclo separado de aprovação.

## Pré-flight (obrigatório antes de rodar)

Execute **na máquina com acesso ao banco de staging**:

```bash
# 1) Confirmar o alvo. A connection string NÃO vai no log.
echo "DATABASE_URL aponta para: $(node -e 'const u=new URL(process.env.DATABASE_URL); console.log(`${u.hostname}:${u.port}${u.pathname}`)')"
# Resultado esperado: algo como "db-staging.internal:5432/zero_staging"
# Se o output mencionar "prod" / "production" — pare. Este runbook é só para staging.

# 2) Confirmar NODE_ENV (se usar o mesmo .env do app)
echo "NODE_ENV=${NODE_ENV}"

# 3) Backup imediatamente antes
./scripts/backup-postgres.sh
# Output esperado: `backups/zelo-YYYYMMDDTHHMMSSZ.dump` + `.sha256` presentes.
# Guarde o nome do arquivo — é o ponto de restore se algo der errado.

# 4) Status atual das migrations
cd backend && npx prisma migrate status
# Resultado esperado:
#   - "Database schema is up to date" até a última migration conhecida (20261104120000_payment_review_restrict_delete)
#   - OU lista a nova 20261104130000_booking_travel como "Following migrations have not yet been applied"
# NUNCA rode `migrate dev` nem `migrate reset` em staging/prod.

# 5) Sanidade da migration localmente
ls -la prisma/migrations/20261104130000_booking_travel/
cat prisma/migrations/20261104130000_booking_travel/migration.sql | head -5
# Confere que o arquivo existe e começa com "-- Sessão de rastreamento..."
```

## Aplicação

```bash
cd backend
npx prisma migrate deploy
```

Output esperado:
```
Applying migration `20261104130000_booking_travel`
The following migration(s) have been applied: ...
```

## Pós-flight (validar)

```bash
# 1) Confirmar status
npx prisma migrate status
# Deve dizer "Database schema is up to date!"

# 2) Regerar o Client (se app ainda não foi deployado)
npx prisma generate

# 3) Verificar objetos criados no DB (usando psql ou cliente preferido):
psql "$DATABASE_URL" <<'SQL'
-- Tabela criada
SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name='BookingTravel';

-- Colunas corretas
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='BookingTravel'
  ORDER BY ordinal_position;

-- Enum existe
SELECT enumlabel FROM pg_enum
  WHERE enumtypid = 'public."BookingTravelStatus"'::regtype;

-- Constraints
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid = 'public."BookingTravel"'::regclass;

-- Índices
SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname='public' AND tablename='BookingTravel';
SQL
```

Esperado:
- Tabela `BookingTravel` presente.
- 8 colunas: `id, bookingId, providerId, status, startedAt, arrivedAt, endedAt, endReason`.
- Enum com 3 valores: `ACTIVE, ARRIVED, CANCELLED`.
- 3 constraints: PK + 2 FKs (ambas `ON DELETE RESTRICT`).
- 3 índices: PK (automático) + `BookingTravel_bookingId_key` (UNIQUE) + `BookingTravel_status_startedAt_idx`.

## Rollback (se necessário)

```bash
# Via Prisma: não há `migrate down` no fluxo deploy. Use SQL direto.
psql "$DATABASE_URL" <<'SQL'
BEGIN;
ALTER TABLE "BookingTravel" DROP CONSTRAINT "BookingTravel_providerId_fkey";
ALTER TABLE "BookingTravel" DROP CONSTRAINT "BookingTravel_bookingId_fkey";
DROP TABLE "BookingTravel";
DROP TYPE "BookingTravelStatus";
-- E remova o registro em _prisma_migrations para que o migrate deploy futuro aplique de novo:
DELETE FROM _prisma_migrations WHERE migration_name='20261104130000_booking_travel';
COMMIT;
SQL
```

**Prefira restore do dump** se houver dados em `BookingTravel`:

```bash
./scripts/restore-postgres.sh backups/zelo-YYYYMMDDTHHMMSSZ.dump
```

## O que pode dar errado

| Sintoma | Causa provável | Ação |
|---|---|---|
| `relation "Booking" does not exist` | Migration base (`20260512142236_init`) não aplicada no staging | `migrate deploy` de todas as pendentes, não só esta |
| `type "BookingTravelStatus" already exists` | Rodar duas vezes sem rollback entre | Rollback → deploy de novo |
| `violates foreign key constraint` | Impossível nesta migration (tabela está vazia) | Investigar antes de continuar |
| Timeout | Lock de longa transação em `Booking` | Esperar fim das transações OU aplicar em janela de manutenção |

## Checklist de aceite

- [ ] Backup gerado antes da aplicação (nome + sha256 anotados).
- [ ] `prisma migrate status` confirma a aplicação sem drift.
- [ ] 4 asserts do SQL acima batem com o esperado.
- [ ] `prisma generate` executado no servidor da API.
- [ ] Nenhuma consulta nova em produção (staging apenas).
