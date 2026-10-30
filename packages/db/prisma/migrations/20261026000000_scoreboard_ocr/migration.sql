-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "analysisExcluded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "analysisExcluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ScoreboardOcr" (
    "matchKey" TEXT NOT NULL,
    "videoKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "observations" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzeAfter" TIMESTAMP(3) NOT NULL,
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "ScoreboardOcr_pkey" PRIMARY KEY ("matchKey")
);

-- CreateTable
CREATE TABLE "ReportValidationFlag" (
    "uuid" TEXT NOT NULL,
    "reportUuid" TEXT NOT NULL,
    "eventUuid" TEXT,
    "evidenceMatchKey" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "ReportValidationFlag_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "ReportValidationFlag_reportUuid_status_idx" ON "ReportValidationFlag"("reportUuid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportValidationFlag_reportUuid_rule_key" ON "ReportValidationFlag"("reportUuid", "rule");

-- AddForeignKey
ALTER TABLE "ScoreboardOcr" ADD CONSTRAINT "ScoreboardOcr_matchKey_fkey" FOREIGN KEY ("matchKey") REFERENCES "Match"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportValidationFlag" ADD CONSTRAINT "ReportValidationFlag_reportUuid_fkey" FOREIGN KEY ("reportUuid") REFERENCES "ScoutReport"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportValidationFlag" ADD CONSTRAINT "ReportValidationFlag_eventUuid_fkey" FOREIGN KEY ("eventUuid") REFERENCES "Event"("eventUuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportValidationFlag" ADD CONSTRAINT "ReportValidationFlag_evidenceMatchKey_fkey" FOREIGN KEY ("evidenceMatchKey") REFERENCES "ScoreboardOcr"("matchKey") ON DELETE CASCADE ON UPDATE CASCADE;
