-- Recurring official imports upsert unchanged rows too. Preserve estimates
-- unless a field actually used by fusion changes.
DROP TRIGGER estimated_official_changed ON "MatchAlliance";
CREATE TRIGGER estimated_official_changed AFTER INSERT OR DELETE ON "MatchAlliance"
FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_match_score();
CREATE TRIGGER estimated_official_updated AFTER UPDATE ON "MatchAlliance"
FOR EACH ROW WHEN (ROW(OLD.score, OLD."scoreBreakdown") IS DISTINCT FROM ROW(NEW.score, NEW."scoreBreakdown"))
EXECUTE FUNCTION invalidate_estimated_match_score();

DROP TRIGGER estimated_roster_changed ON "TeamMatchData";
CREATE TRIGGER estimated_roster_changed AFTER INSERT OR DELETE ON "TeamMatchData"
FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_match_score();
CREATE TRIGGER estimated_roster_updated AFTER UPDATE ON "TeamMatchData"
FOR EACH ROW WHEN (ROW(OLD."matchKey", OLD."teamNumber", OLD.alliance, OLD.station, OLD."externalParticipantKey")
  IS DISTINCT FROM ROW(NEW."matchKey", NEW."teamNumber", NEW.alliance, NEW.station, NEW."externalParticipantKey"))
EXECUTE FUNCTION invalidate_estimated_match_score();

DROP TRIGGER estimated_ocr_changed ON "ScoreboardOcr";
CREATE TRIGGER estimated_ocr_changed AFTER DELETE ON "ScoreboardOcr"
FOR EACH ROW EXECUTE FUNCTION invalidate_estimated_match_score();
CREATE TRIGGER estimated_ocr_updated AFTER UPDATE ON "ScoreboardOcr"
FOR EACH ROW WHEN (ROW(OLD.observations, OLD.channels, OLD.status, OLD."videoKey", OLD."templateVersion")
  IS DISTINCT FROM ROW(NEW.observations, NEW.channels, NEW.status, NEW."videoKey", NEW."templateVersion"))
EXECUTE FUNCTION invalidate_estimated_match_score();

DROP TRIGGER estimated_source_changed ON "Scouter";
CREATE TRIGGER estimated_source_changed AFTER UPDATE OF "sourceTeamNumber" ON "Scouter"
FOR EACH ROW WHEN (OLD."sourceTeamNumber" IS DISTINCT FROM NEW."sourceTeamNumber")
EXECUTE FUNCTION invalidate_estimated_source_score();
