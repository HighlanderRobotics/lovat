-- Existing report-derived practice rows remain private unless publicly scheduled.
ALTER TABLE "TeamMatchData"
ADD COLUMN "practiceScheduled" BOOLEAN NOT NULL DEFAULT false;
