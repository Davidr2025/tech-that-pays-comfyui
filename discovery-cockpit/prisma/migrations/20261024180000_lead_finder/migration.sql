-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN "leadFinderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consultant" ADD COLUMN "leadLocation" TEXT;
ALTER TABLE "Consultant" ADD COLUMN "leadNiche" TEXT;
ALTER TABLE "Consultant" ADD COLUMN "leadSource" TEXT;

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "niche" TEXT,
    "location" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Lead_consultantId_createdAt_idx" ON "Lead"("consultantId", "createdAt");
