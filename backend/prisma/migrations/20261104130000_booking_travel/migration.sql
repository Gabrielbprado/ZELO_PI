-- Sessão de rastreamento em tempo real (ciclo de vida apenas; coordenadas no Redis).
-- Aditiva, reversível com DROP TABLE + DROP TYPE.

CREATE TYPE "BookingTravelStatus" AS ENUM ('ACTIVE', 'ARRIVED', 'CANCELLED');

CREATE TABLE "BookingTravel" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "status" "BookingTravelStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "arrivedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,

  CONSTRAINT "BookingTravel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingTravel_bookingId_key" ON "BookingTravel"("bookingId");
CREATE INDEX "BookingTravel_status_startedAt_idx" ON "BookingTravel"("status", "startedAt");

-- Restrict em ambos: histórico financeiro/operacional não some quando apagam booking ou provider.
ALTER TABLE "BookingTravel" ADD CONSTRAINT "BookingTravel_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingTravel" ADD CONSTRAINT "BookingTravel_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
