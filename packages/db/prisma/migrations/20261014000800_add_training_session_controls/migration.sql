ALTER TABLE "TrainingVideo"
  ADD COLUMN "startOffsetSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 163,
  ADD COLUMN "alliance" "AllianceColor" NOT NULL DEFAULT 'RED',
  ADD COLUMN "excludedFields" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TrainingVideo" ADD CONSTRAINT "TrainingVideo_playback_check"
  CHECK ("startOffsetSeconds" >= 0 AND "durationSeconds" > 0 AND jsonb_typeof("excludedFields") = 'array');
ALTER TABLE "TrainingSession"
  ALTER COLUMN "sourceTeamNumber" DROP NOT NULL,
  ADD COLUMN "browserTokenHash" TEXT,
  ADD COLUMN "targetTeamNumber" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'LOBBY',
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_status_check"
  CHECK ("status" IN ('LOBBY', 'ARMED', 'PLAYING', 'ENDED', 'INTERRUPTED'));
ALTER TABLE "TrainingAttempt"
  ADD COLUMN "deviceId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "deviceName" TEXT NOT NULL DEFAULT 'Collection device',
  ADD COLUMN "accessTokenHash" TEXT,
  ADD COLUMN "ready" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
