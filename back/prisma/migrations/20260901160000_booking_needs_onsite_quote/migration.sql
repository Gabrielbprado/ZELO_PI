-- Adiciona flag para bookings que exigem visita técnica antes do orçamento final.
ALTER TABLE "Booking" ADD COLUMN "needsOnSiteQuote" BOOLEAN NOT NULL DEFAULT false;
