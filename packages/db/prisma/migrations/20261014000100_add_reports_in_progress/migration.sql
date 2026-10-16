-- CreateEnum
CREATE TYPE "CollectionReportMode" AS ENUM ('COMPETITION', 'TRAINING');

-- CreateEnum
CREATE TYPE "CollectionReportStatus" AS ENUM ('LOADED', 'STARTED', 'ENDED', 'SUBMITTED', 'ABANDONED');

-- CreateTable
CREATE TABLE "TrainingSession" (
    "uuid" TEXT NOT NULL,
    "sourceTeamNumber" INTEGER NOT NULL,
    "pairingTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TrainingAttempt" (
    "uuid" TEXT NOT NULL,
    "sessionUuid" TEXT NOT NULL,
    "scouterUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "payload" JSONB,

    CONSTRAINT "TrainingAttempt_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ScoutReportInProgress" (
    "uuid" TEXT NOT NULL,
    "sourceTeamNumber" INTEGER NOT NULL,
    "scouterUuid" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "mode" "CollectionReportMode" NOT NULL,
    "status" "CollectionReportStatus" NOT NULL DEFAULT 'LOADED',
    "tournamentKey" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "trainingSessionUuid" TEXT,
    "trainingAttemptUuid" TEXT,
    "payload" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedReportUuid" TEXT,
    "submittedPayloadHash" TEXT,
    "loadRequestHash" TEXT NOT NULL,
    "transitionReceipts" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ScoutReportInProgress_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_pairingTokenHash_key" ON "TrainingSession"("pairingTokenHash");

-- CreateIndex
CREATE INDEX "TrainingAttempt_sessionUuid_scouterUuid_idx" ON "TrainingAttempt"("sessionUuid", "scouterUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutReportInProgress_trainingAttemptUuid_key" ON "ScoutReportInProgress"("trainingAttemptUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutReportInProgress_finalizedReportUuid_key" ON "ScoutReportInProgress"("finalizedReportUuid");

-- CreateIndex
CREATE INDEX "ScoutReportInProgress_sourceTeamNumber_scouterUuid_status_u_idx" ON "ScoutReportInProgress"("sourceTeamNumber", "scouterUuid", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ScoutReportInProgress_sourceTeamNumber_tournamentKey_matchT_idx" ON "ScoutReportInProgress"("sourceTeamNumber", "tournamentKey", "matchType", "matchNumber");

-- CreateIndex
CREATE INDEX "ScoutReportInProgress_status_expiresAt_idx" ON "ScoutReportInProgress"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_sourceTeamNumber_fkey" FOREIGN KEY ("sourceTeamNumber") REFERENCES "RegisteredTeam"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_sessionUuid_fkey" FOREIGN KEY ("sessionUuid") REFERENCES "TrainingSession"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_scouterUuid_fkey" FOREIGN KEY ("scouterUuid") REFERENCES "Scouter"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReportInProgress" ADD CONSTRAINT "ScoutReportInProgress_sourceTeamNumber_fkey" FOREIGN KEY ("sourceTeamNumber") REFERENCES "RegisteredTeam"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReportInProgress" ADD CONSTRAINT "ScoutReportInProgress_scouterUuid_fkey" FOREIGN KEY ("scouterUuid") REFERENCES "Scouter"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReportInProgress" ADD CONSTRAINT "ScoutReportInProgress_finalizedReportUuid_fkey" FOREIGN KEY ("finalizedReportUuid") REFERENCES "ScoutReport"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReportInProgress" ADD CONSTRAINT "ScoutReportInProgress_trainingSessionUuid_fkey" FOREIGN KEY ("trainingSessionUuid") REFERENCES "TrainingSession"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Drafts must never fall back from a training destination to competition.
ALTER TABLE "ScoutReportInProgress"
  ADD CONSTRAINT "ScoutReportInProgress_mode_binding_check" CHECK (
    ("mode" = 'COMPETITION' AND "trainingSessionUuid" IS NULL AND "trainingAttemptUuid" IS NULL)
    OR ("mode" = 'TRAINING' AND "trainingSessionUuid" IS NOT NULL AND "trainingAttemptUuid" IS NOT NULL AND "finalizedReportUuid" IS NULL)
  ),
  ADD CONSTRAINT "ScoutReportInProgress_finalized_check" CHECK ("finalizedReportUuid" IS NULL OR ("mode" = 'COMPETITION' AND "status" = 'SUBMITTED')),
  ADD CONSTRAINT "ScoutReportInProgress_revision_check" CHECK ("revision" >= 0 AND "schemaVersion" > 0),
  ADD CONSTRAINT "ScoutReportInProgress_times_check" CHECK ("endedAt" IS NULL OR ("startedAt" IS NOT NULL AND "endedAt" >= "startedAt")),
  ADD CONSTRAINT "ScoutReportInProgress_submitted_check" CHECK (
    ("status" = 'SUBMITTED' AND "submittedAt" IS NOT NULL AND "submittedPayloadHash" IS NOT NULL AND "endedAt" IS NOT NULL)
    OR ("status" <> 'SUBMITTED' AND "submittedAt" IS NULL AND "submittedPayloadHash" IS NULL)
  );

-- Pair references must agree on session and scout, even for writes outside HTTP.
CREATE UNIQUE INDEX "TrainingAttempt_uuid_sessionUuid_scouterUuid_key" ON "TrainingAttempt" ("uuid", "sessionUuid", "scouterUuid");
ALTER TABLE "ScoutReportInProgress" ADD CONSTRAINT "ScoutReportInProgress_attempt_identity_fkey"
  FOREIGN KEY ("trainingAttemptUuid", "trainingSessionUuid", "scouterUuid")
  REFERENCES "TrainingAttempt" ("uuid", "sessionUuid", "scouterUuid") ON DELETE RESTRICT ON UPDATE CASCADE;
