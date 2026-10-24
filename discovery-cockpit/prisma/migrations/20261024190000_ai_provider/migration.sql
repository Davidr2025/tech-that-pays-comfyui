-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'mock';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "liveState" JSONB;
ALTER TABLE "Session" ADD COLUMN "liveSeen" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "liveProvider" TEXT;
