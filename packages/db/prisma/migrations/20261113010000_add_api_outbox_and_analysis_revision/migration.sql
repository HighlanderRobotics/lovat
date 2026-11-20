CREATE TABLE "AnalysisRevision" (
  "teamNumber" INTEGER NOT NULL PRIMARY KEY,
  "revision" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ApiOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupeKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ApiOutbox_dedupeKey_key" ON "ApiOutbox"("dedupeKey");
CREATE INDEX "ApiOutbox_completedAt_availableAt_idx" ON "ApiOutbox"("completedAt", "availableAt");
