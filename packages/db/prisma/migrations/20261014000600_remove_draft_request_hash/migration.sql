-- Client UUID and explicit draft identity fields replace request hashing.
-- Only the redundant technical hash is removed; report data is preserved.
ALTER TABLE "ScoutReportInProgress" DROP COLUMN "loadRequestHash";
