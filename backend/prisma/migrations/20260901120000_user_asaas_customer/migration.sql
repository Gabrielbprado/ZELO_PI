-- Referência ao cliente correspondente no Asaas (gateway de pagamento).
ALTER TABLE "User" ADD COLUMN "asaasCustomerId" TEXT;
