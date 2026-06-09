-- Add attachment metadata so chat messages can carry an uploaded file.
ALTER TABLE "Message"
  ADD COLUMN "attachmentUrl"  TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentType" TEXT,
  ADD COLUMN "attachmentSize" INTEGER;
