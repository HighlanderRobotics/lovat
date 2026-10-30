-- Run in production with psql variables source_role and source_password.
-- Only numeric/categorical report data for the explicitly approved events is
-- exposed. No notes, scout names, accounts, join codes or credentials are read
-- by the preview worker. Production reports/events are never updated.
BEGIN;
CREATE OR REPLACE VIEW "OcrReportSourceV1" AS
SELECT t."tournamentKey" AS "eventKey", r.uuid AS "reportUuid",
 jsonb_build_object(
  'analysisExcluded',COALESCE((to_jsonb(r)->>'analysisExcluded')::boolean,false),'uuid',r.uuid,'scouterUuid',r."scouterUuid",'sourceTeamNumber',s."sourceTeamNumber",
  'matchKey',t."matchKey",'teamNumber',t."teamNumber",'matchType',t."matchType",'matchNumber',t."matchNumber",
  'startTime',r."startTime",'robotRoles',r."robotRoles",'driverAbility',r."driverAbility",
  'accuracy',r.accuracy,'beached',r.beached,'climbPosition',r."climbPosition",'climbSide',r."climbSide",
  'defenseEffectiveness',r."defenseEffectiveness",'feederTypes',r."feederTypes",'intakeType',r."intakeType",
  'fieldTraversal',r."fieldTraversal",'scoresWhileMoving',r."scoresWhileMoving",'disrupts',r.disrupts,
  'endgameClimb',r."endgameClimb",'autoClimb',r."autoClimb",
  'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('analysisExcluded',COALESCE((to_jsonb(e)->>'analysisExcluded')::boolean,false),'eventUuid',e."eventUuid",'time',e.time,'action',e.action,'position',e.position,'points',e.points,'quantity',e.quantity) ORDER BY e.time,e."eventUuid") FROM "Event" e WHERE e."scoutReportUuid"=r.uuid),'[]'::jsonb)
 ) AS payload
FROM "ScoutReport" r JOIN "Scouter" s ON s.uuid=r."scouterUuid" JOIN "TeamMatchData" t ON t.key=r."teamMatchKey"
WHERE t."tournamentKey" IN ('2026cacg','2026casnf','2026cagle') AND t."matchType" <> 'PRACTICE'
 AND COALESCE((to_jsonb(r)->>'training')::boolean,false)=false;
REVOKE ALL ON "OcrReportSourceV1" FROM PUBLIC;
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L CONNECTION LIMIT 3', :'source_role', :'source_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),:'source_role') \gexec
GRANT USAGE ON SCHEMA public TO :"source_role";
GRANT SELECT ON "OcrReportSourceV1" TO :"source_role";
ALTER ROLE :"source_role" SET default_transaction_read_only=on;
ALTER ROLE :"source_role" SET statement_timeout='60s';
COMMIT;
