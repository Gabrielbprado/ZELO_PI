-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "consumer" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("consumer","eventId")
);

-- Índice PARCIAL: o relay só varre eventos ainda não publicados. Restrito a
-- `publishedAt IS NULL`, o índice mantém tamanho ~constante (a fila de trabalho),
-- e não cresce com o histórico já publicado — o polling continua barato para sempre.
-- O Prisma não expressa `WHERE` em índice, então esta linha é o motivo desta
-- migration ter sido criada com `--create-only` e editada à mão.
CREATE INDEX "OutboxEvent_unpublished_idx" ON "OutboxEvent" ("createdAt") WHERE "publishedAt" IS NULL;
