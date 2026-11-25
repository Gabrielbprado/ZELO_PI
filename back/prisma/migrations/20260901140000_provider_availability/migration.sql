-- Agenda e disponibilidade do profissional.
-- NOTA: o `prisma migrate diff` sugeriu DROP nos índices espaciais (Booking_location_idx,
-- ProviderProfile_location_idx) porque as colunas `location` são Unsupported (PostGIS, via
-- SQL cru). Esses DROPs foram REMOVIDOS de propósito — os índices GIST são essenciais para
-- as consultas por proximidade.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "ProviderAvailability" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTimeOff" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderAvailability_providerId_weekday_idx" ON "ProviderAvailability"("providerId", "weekday");

-- CreateIndex
CREATE INDEX "ProviderTimeOff_providerId_startsAt_idx" ON "ProviderTimeOff"("providerId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_providerId_scheduledAt_idx" ON "Booking"("providerId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTimeOff" ADD CONSTRAINT "ProviderTimeOff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
