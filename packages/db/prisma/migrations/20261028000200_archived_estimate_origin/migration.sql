ALTER TABLE "EstimatedScore" ADD COLUMN "inputOrigin" TEXT NOT NULL DEFAULT 'LIVE';
ALTER TABLE "EstimatedScore" ADD CONSTRAINT "EstimatedScore_inputOrigin_check" CHECK ("inputOrigin" IN ('LIVE', 'ARCHIVE'));
