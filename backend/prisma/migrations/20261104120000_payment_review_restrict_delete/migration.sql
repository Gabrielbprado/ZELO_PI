-- Proteção de histórico financeiro e reputacional contra DELETE em cascata.
--
-- Antes: deletar um Booking apagava Payment e Review junto (ON DELETE CASCADE).
-- Para um marketplace que lida com dinheiro, isso é inaceitável — qualquer DELETE
-- operacional ou bug sumia com receita e nota do profissional sem trilha.
--
-- Depois: ON DELETE RESTRICT em ambos. Postgres barra o DELETE do Booking enquanto
-- houver Payment ou Review associado. Fluxos legítimos de cancelamento continuam
-- funcionando via transições de STATUS (CANCELLED, REFUNDED) — não DELETE.
--
-- Reversão (se alguma vez necessário):
--   ALTER TABLE "Payment" DROP CONSTRAINT "Payment_bookingId_fkey";
--   ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey"
--     FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   (idem para Review)

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_bookingId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" DROP CONSTRAINT "Review_bookingId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice para range queries em Review por booking (ex.: timeline de avaliações de um
-- serviço). O @@unique([bookingId, authorId]) existente serve PK mas não range.
CREATE INDEX IF NOT EXISTS "Review_bookingId_createdAt_idx" ON "Review" ("bookingId", "createdAt");
