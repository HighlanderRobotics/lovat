-- CreateTable
CREATE TABLE "TrainingScore" (
    "uuid" TEXT NOT NULL,
    "reportUuid" TEXT NOT NULL,
    "answerKeyReportUuid" TEXT,
    "rubricVersion" TEXT NOT NULL,
    "overallScore" DECIMAL(5,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "answerKeySnapshot" JSONB NOT NULL,
    "submittedReportSnapshot" JSONB NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingScore_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "TrainingScore_reportUuid_gradedAt_idx" ON "TrainingScore"("reportUuid", "gradedAt");

-- CreateIndex
CREATE INDEX "TrainingScore_answerKeyReportUuid_idx" ON "TrainingScore"("answerKeyReportUuid");

-- AddForeignKey
ALTER TABLE "TrainingScore" ADD CONSTRAINT "TrainingScore_reportUuid_fkey" FOREIGN KEY ("reportUuid") REFERENCES "ScoutReport"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingScore" ADD CONSTRAINT "TrainingScore_answerKeyReportUuid_fkey" FOREIGN KEY ("answerKeyReportUuid") REFERENCES "ScoutReport"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrainingScore"
  ADD CONSTRAINT "TrainingScore_overallScore_check" CHECK ("overallScore" >= 0 AND "overallScore" <= 100),
  ADD CONSTRAINT "TrainingScore_rubricVersion_check" CHECK (length(btrim("rubricVersion")) > 0),
  ADD CONSTRAINT "TrainingScore_snapshots_check" CHECK (
    jsonb_typeof("answerKeySnapshot") = 'object' AND
    jsonb_typeof("submittedReportSnapshot") = 'object' AND
    jsonb_typeof("breakdown") = 'object'
  );
