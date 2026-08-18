-- Roda uma única vez, na criação do volume do Postgres.
-- O banco de testes de integração precisa existir antes de `npm run
-- test:integration`; o PostGIS é habilitado pela própria migração do Prisma.
SELECT 'CREATE DATABASE zero_marketplace_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zero_marketplace_test')\gexec
