BEGIN;

CREATE TABLE "FetchState" (
    "provider" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,

    CONSTRAINT "FetchState_pkey" PRIMARY KEY ("provider", "resourceKey")
);

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportJob_kind_targetKey_key" ON "ImportJob"("kind", "targetKey");
CREATE INDEX "ImportJob_runAt_idx" ON "ImportJob"("runAt");

COMMIT;
