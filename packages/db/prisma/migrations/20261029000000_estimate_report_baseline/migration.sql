ALTER TABLE "EstimatedScore" ADD COLUMN "scoutPoints" DOUBLE PRECISION;
ALTER TABLE "EstimatedScore" ADD CONSTRAINT "EstimatedScore_scoutPoints_check"
CHECK ("scoutPoints" IS NULL OR ("scoutPoints" >= 0 AND "scoutPoints" < 'Infinity'::double precision));
