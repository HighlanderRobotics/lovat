-- Preserve the enum, report column and user flags created by the existing migration.
-- New and existing databases reach this migration after add_report_flagging.
ALTER TYPE "ReportReliability" ADD VALUE IF NOT EXISTS 'FLAGGED_USER';
ALTER TYPE "ReportReliability" ADD VALUE IF NOT EXISTS 'FLAGGED_SYSTEM';
