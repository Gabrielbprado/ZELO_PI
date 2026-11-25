-- Uma cobranca externa so pode apontar para um pagamento interno. Isso impede que
-- webhooks do gateway confirmem o booking errado quando houver duplicidade acidental.
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");
