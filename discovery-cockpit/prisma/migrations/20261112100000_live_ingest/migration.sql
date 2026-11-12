-- AlterTable
ALTER TABLE "Session" ADD COLUMN "ingestTokenHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "botId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_ingestTokenHash_key" ON "Session"("ingestTokenHash");
