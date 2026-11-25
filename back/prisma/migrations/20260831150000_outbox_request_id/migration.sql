-- Correlation id da request que originou o evento, para o rastro ponta a ponta.
ALTER TABLE "OutboxEvent" ADD COLUMN "requestId" TEXT;
