-- Moderação assistida por IA: classificação automática das denúncias e trilha das
-- decisões (da IA e dos admins).
--
-- NOTA: os DROP INDEX de Booking_location_idx / ProviderProfile_location_idx sugeridos
-- pelo migrate diff foram REMOVIDOS (índices espaciais PostGIS, criados via SQL cru).

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'SERVICE', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "ModerationCategory" AS ENUM ('FRAUD', 'SPAM', 'INAPPROPRIATE', 'HARASSMENT', 'SAFETY', 'OFF_PLATFORM', 'NONE');

-- CreateEnum
CREATE TYPE "ModerationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('AI_CLASSIFIED', 'ACCEPT', 'REJECT', 'REQUEST_INFO', 'WARN', 'SUSPEND', 'BLOCK', 'UNBLOCK');

-- AlterEnum (novo estado: o admin pediu mais informações ao denunciante)
ALTER TYPE "ReportStatus" ADD VALUE 'AWAITING_INFO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "suspendedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report"
  ADD COLUMN "targetType"     "ReportTargetType" NOT NULL DEFAULT 'USER',
  ADD COLUMN "targetRefId"    TEXT,
  ADD COLUMN "evidence"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "aiCategory"     "ModerationCategory",
  ADD COLUMN "aiSeverity"     "ModerationSeverity",
  ADD COLUMN "aiPriority"     INTEGER,
  ADD COLUMN "aiConfidence"   DOUBLE PRECISION,
  ADD COLUMN "aiAction"       "ModerationActionType",
  ADD COLUMN "aiSignals"      JSONB,
  ADD COLUMN "aiModelVersion" TEXT,
  ADD COLUMN "aiAnalyzedAt"   TIMESTAMP(3);

-- O DEFAULT acima existe só para preencher as denúncias já gravadas com `{}` em vez de
-- NULL; o Prisma não declara default em lista escalar, então ele sai depois de servir.
ALTER TABLE "Report" ALTER COLUMN "evidence" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "targetUserId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ModerationActionType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAction_reportId_idx" ON "ModerationAction"("reportId");

-- CreateIndex
CREATE INDEX "ModerationAction_targetUserId_createdAt_idx" ON "ModerationAction"("targetUserId", "createdAt");

-- CreateIndex (fila do admin: abertas, mais graves primeiro)
CREATE INDEX "Report_status_aiPriority_idx" ON "Report"("status", "aiPriority");
