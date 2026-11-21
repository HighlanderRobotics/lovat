-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "trainingVideoUuid" TEXT;

-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "training" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trainingSessionUuid" TEXT;

-- CreateTable
CREATE TABLE "TrainingVideo" (
    "uuid" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "videoLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingVideo_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "_TrainingVideoAnswerKeys" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TrainingVideoAnswerKeys_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "TrainingVideo_matchKey_idx" ON "TrainingVideo"("matchKey");

-- CreateIndex
CREATE INDEX "_TrainingVideoAnswerKeys_B_index" ON "_TrainingVideoAnswerKeys"("B");

-- CreateIndex
CREATE INDEX "TrainingSession_trainingVideoUuid_idx" ON "TrainingSession"("trainingVideoUuid");

-- CreateIndex
CREATE INDEX "ScoutReport_trainingSessionUuid_idx" ON "ScoutReport"("trainingSessionUuid");

-- AddForeignKey
ALTER TABLE "TrainingVideo" ADD CONSTRAINT "TrainingVideo_matchKey_fkey" FOREIGN KEY ("matchKey") REFERENCES "Match"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainingVideoUuid_fkey" FOREIGN KEY ("trainingVideoUuid") REFERENCES "TrainingVideo"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_trainingSessionUuid_fkey" FOREIGN KEY ("trainingSessionUuid") REFERENCES "TrainingSession"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrainingVideoAnswerKeys" ADD CONSTRAINT "_TrainingVideoAnswerKeys_A_fkey" FOREIGN KEY ("A") REFERENCES "ScoutReport"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrainingVideoAnswerKeys" ADD CONSTRAINT "_TrainingVideoAnswerKeys_B_fkey" FOREIGN KEY ("B") REFERENCES "TrainingVideo"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- A session-bound report is always a training report. Answer keys may be training
-- reports without a session because they are prepared before scouts practice.
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_training_session_check"
  CHECK ("trainingSessionUuid" IS NULL OR "training" = true);

-- Training drafts can now finalize into ScoutReport while retaining their session.
ALTER TABLE "ScoutReportInProgress" DROP CONSTRAINT "ScoutReportInProgress_mode_binding_check",
  ADD CONSTRAINT "ScoutReportInProgress_mode_binding_check" CHECK (
    ("mode" = 'COMPETITION' AND "trainingSessionUuid" IS NULL AND "trainingAttemptUuid" IS NULL)
    OR ("mode" = 'TRAINING' AND "trainingSessionUuid" IS NOT NULL AND "trainingAttemptUuid" IS NOT NULL)
  );
ALTER TABLE "ScoutReportInProgress" DROP CONSTRAINT "ScoutReportInProgress_finalized_check",
  ADD CONSTRAINT "ScoutReportInProgress_finalized_check" CHECK ("finalizedReportUuid" IS NULL OR "status" = 'SUBMITTED');
