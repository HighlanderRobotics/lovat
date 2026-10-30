ALTER TABLE "ScoreboardOcr" ADD COLUMN "channels" JSONB;

CREATE TABLE "EstimatedScore" (
  "matchKey" TEXT NOT NULL REFERENCES "Match"("key") ON DELETE CASCADE ON UPDATE CASCADE,
  "teamNumber" INTEGER NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "sourceTeams" INTEGER[] NOT NULL,
  "algorithm" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "attributionStatus" TEXT NOT NULL,
  "reportCount" INTEGER NOT NULL CHECK ("reportCount" >= 0),
  "autoFuel" INTEGER NOT NULL CHECK ("autoFuel" >= 0),
  "autoPoints" INTEGER NOT NULL CHECK ("autoPoints" >= 0),
  "teleopFuel" INTEGER NOT NULL CHECK ("teleopFuel" >= 0),
  "teleopPoints" INTEGER NOT NULL CHECK ("teleopPoints" >= 0),
  "totalFuel" INTEGER NOT NULL CHECK ("totalFuel" = "autoFuel" + "teleopFuel"),
  "totalPoints" INTEGER NOT NULL CHECK ("totalPoints" = "autoPoints" + "teleopPoints"),
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("matchKey", "teamNumber", "scopeKey"),
  CHECK (cardinality("sourceTeams") > 0)
);
CREATE INDEX "EstimatedScore_teamNumber_calculatedAt_idx" ON "EstimatedScore"("teamNumber", "calculatedAt");

-- Invalidate derived estimates whenever their report inputs change, including
-- lead exclusions. Notes also invalidate; correctness takes priority over reuse.
CREATE FUNCTION invalidate_estimated_report_score() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_key TEXT; new_key TEXT; lock_key TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Event' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT t."matchKey" INTO old_key FROM "ScoutReport" r JOIN "TeamMatchData" t ON t.key = r."teamMatchKey" WHERE r.uuid = OLD."scoutReportUuid";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT t."matchKey" INTO new_key FROM "ScoutReport" r JOIN "TeamMatchData" t ON t.key = r."teamMatchKey" WHERE r.uuid = NEW."scoutReportUuid";
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN SELECT "matchKey" INTO old_key FROM "TeamMatchData" WHERE key = OLD."teamMatchKey"; END IF;
    IF TG_OP <> 'DELETE' THEN SELECT "matchKey" INTO new_key FROM "TeamMatchData" WHERE key = NEW."teamMatchKey"; END IF;
  END IF;
  FOR lock_key IN SELECT DISTINCT k FROM unnest(ARRAY[old_key, new_key]) AS k WHERE k IS NOT NULL ORDER BY k LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(lock_key, 195));
  END LOOP;
  DELETE FROM "EstimatedScore" WHERE "matchKey" IN (old_key, new_key);
  UPDATE "ScoreboardOcr" o SET "analyzedAt" = NULL WHERE o."matchKey" IN (old_key, new_key) AND EXISTS (SELECT 1 FROM "Match" m WHERE m.key = o."matchKey");
  RETURN NULL;
END $$;
CREATE TRIGGER estimated_report_changed AFTER INSERT OR UPDATE OR DELETE ON "ScoutReport" FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_report_score();
CREATE TRIGGER estimated_event_changed AFTER INSERT OR UPDATE OR DELETE ON "Event" FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_report_score();

CREATE FUNCTION invalidate_estimated_match_score() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_key TEXT; new_key TEXT; lock_key TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_key := OLD."matchKey"; END IF;
  IF TG_OP <> 'DELETE' THEN new_key := NEW."matchKey"; END IF;
  FOR lock_key IN SELECT DISTINCT k FROM unnest(ARRAY[old_key, new_key]) AS k WHERE k IS NOT NULL ORDER BY k LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(lock_key, 195));
  END LOOP;
  DELETE FROM "EstimatedScore" WHERE "matchKey" IN (old_key, new_key);
  UPDATE "ScoreboardOcr" o SET "analyzedAt" = NULL WHERE o."matchKey" IN (old_key, new_key) AND EXISTS (SELECT 1 FROM "Match" m WHERE m.key = o."matchKey");
  RETURN NULL;
END $$;
CREATE TRIGGER estimated_official_changed AFTER INSERT OR UPDATE OR DELETE ON "MatchAlliance" FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_match_score();
CREATE TRIGGER estimated_roster_changed AFTER INSERT OR UPDATE OR DELETE ON "TeamMatchData" FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_match_score();
CREATE TRIGGER estimated_ocr_changed AFTER UPDATE OF observations, channels, status, "videoKey", "templateVersion" OR DELETE ON "ScoreboardOcr" FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_match_score();

-- A scouter moved to a different source team changes who may see the inputs.
CREATE FUNCTION invalidate_estimated_source_score() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected RECORD;
BEGIN
  FOR affected IN SELECT DISTINCT t."matchKey" AS key FROM "ScoutReport" sr JOIN "TeamMatchData" t ON t.key = sr."teamMatchKey" WHERE sr."scouterUuid" = NEW.uuid AND t."matchKey" IS NOT NULL ORDER BY t."matchKey" LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(affected.key, 195));
    DELETE FROM "EstimatedScore" WHERE "matchKey" = affected.key;
    UPDATE "ScoreboardOcr" o SET "analyzedAt" = NULL WHERE o."matchKey" = affected.key AND EXISTS (SELECT 1 FROM "Match" m WHERE m.key = o."matchKey");
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER estimated_source_changed AFTER UPDATE OF "sourceTeamNumber" ON "Scouter" FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_source_score();
