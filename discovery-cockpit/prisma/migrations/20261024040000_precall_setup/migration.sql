-- AlterTable
ALTER TABLE "Client" ADD COLUMN "brandColors" JSONB;
ALTER TABLE "Client" ADD COLUMN "calendarLink" TEXT;
ALTER TABLE "Client" ADD COLUMN "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "TranscriptSegment" ADD COLUMN "startSec" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consultant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0f766e',
    "accentColor" TEXT NOT NULL DEFAULT '#d97706',
    "calendarLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- brandColor is renamed to primaryColor: carry the value across instead of dropping it.
INSERT INTO "new_Consultant" ("businessName", "createdAt", "email", "id", "name", "tagline", "primaryColor") SELECT "businessName", "createdAt", "email", "id", "name", "tagline", "brandColor" FROM "Consultant";
DROP TABLE "Consultant";
ALTER TABLE "new_Consultant" RENAME TO "Consultant";
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DISCOVERY',
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "brandingMode" TEXT NOT NULL DEFAULT 'CONSULTANT',
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "internalNotes" TEXT,
    "decisionReadiness" INTEGER,
    "coaching" JSONB,
    CONSTRAINT "Session_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("clientId", "coaching", "consultantId", "createdAt", "decisionReadiness", "id", "internalNotes", "title", "type") SELECT "clientId", "coaching", "consultantId", "createdAt", "decisionReadiness", "id", "internalNotes", "title", "type" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

