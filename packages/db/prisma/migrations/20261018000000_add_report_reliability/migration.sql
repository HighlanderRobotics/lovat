-- CreateEnum
CREATE TYPE "ReportReliability" AS ENUM ('VERIFIED', 'UNVERIFIED', 'FLAGGED_USER', 'FLAGGED_SYSTEM', 'BAD_REPORT');

-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN "reliability" "ReportReliability" NOT NULL DEFAULT 'UNVERIFIED';
