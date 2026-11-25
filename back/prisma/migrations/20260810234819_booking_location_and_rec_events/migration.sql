-- Recomendação personalizada (ML): âncora geográfica do booking + telemetria
-- do carrossel + armazenamento do artefato do modelo.
--
-- NOTA: o `DROP INDEX "ProviderProfile_location_idx"` que o Prisma gera aqui foi
-- REMOVIDO de propósito. Aquele índice GiST foi criado à mão em
-- 20260531202637_postgis_location e não é declarável no schema (a coluna é
-- `Unsupported`), então o Prisma o enxerga como órfão a cada migração. Dropá-lo
-- degradaria ST_DWithin/ordenação por distância para full scan.

-- CreateEnum
CREATE TYPE "RecEventType" AS ENUM ('IMPRESSION', 'CLICK', 'BOOKED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "location" geography(Point, 4326);

-- Índice espacial do booking (mesmo motivo do de ProviderProfile: o Prisma não
-- gera índice para coluna Unsupported).
CREATE INDEX "Booking_location_idx" ON "Booking" USING GIST ("location");

-- CreateTable
CREATE TABLE "RecEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "type" "RecEventType" NOT NULL,
    "position" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "strategy" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlModelArtifact" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "blob" BYTEA NOT NULL,
    "metrics" JSONB,
    "featureNames" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MlModelArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecEvent_requestId_idx" ON "RecEvent"("requestId");

-- CreateIndex
CREATE INDEX "RecEvent_userId_createdAt_idx" ON "RecEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecEvent_providerId_type_idx" ON "RecEvent"("providerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MlModelArtifact_version_key" ON "MlModelArtifact"("version");

-- CreateIndex
CREATE INDEX "MlModelArtifact_isActive_createdAt_idx" ON "MlModelArtifact"("isActive", "createdAt");

-- AddForeignKey
ALTER TABLE "RecEvent" ADD CONSTRAINT "RecEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecEvent" ADD CONSTRAINT "RecEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
