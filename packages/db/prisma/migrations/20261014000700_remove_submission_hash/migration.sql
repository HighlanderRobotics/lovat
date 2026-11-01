-- Submission retries compare the stored JSON payload directly.
ALTER TABLE "ScoutReportInProgress" DROP CONSTRAINT "ScoutReportInProgress_submitted_check";
ALTER TABLE "ScoutReportInProgress" DROP COLUMN "submittedPayloadHash";
ALTER TABLE "ScoutReportInProgress" ADD CONSTRAINT "ScoutReportInProgress_submitted_check" CHECK (
  ("status" = 'SUBMITTED' AND "submittedAt" IS NOT NULL AND "endedAt" IS NOT NULL)
  OR ("status" <> 'SUBMITTED' AND "submittedAt" IS NULL)
);
