import { createHash } from "node:crypto";
import { z } from "zod";
import { fusionInputSchema, prepareFusion } from "./fusion-common";
import { fuseOfficialMatch, OFFICIAL_POLICY } from "./fusion-official";
import { averageScoutPoints } from "./scout-score";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// Dollar quoting handles both SQL quotes and backslashes without relying on
// standard_conforming_strings. Reject even a hypothetical delimiter collision.
function quote(value: string) {
  const tag = `$v${sha(value).slice(0, 24)}$`;
  if (value.includes(tag)) throw new Error("SQL literal delimiter collision");
  return tag + value + tag;
}
const official = z.object({
  alliances: z.object({
    red: z.object({ score: z.number().int() }),
    blue: z.object({ score: z.number().int() }),
  }),
  score_breakdown: z.object({
    red: z.record(z.string(), z.unknown()),
    blue: z.record(z.string(), z.unknown()),
  }),
});

/** Restore derived values only when their scoped live report inputs are absent.
 * No raw reports/notes, manual allocations, experimental policies or live-row
 * overwrites are included in the generated SQL. */
export function buildEstimateArchive(
  rawInputs: unknown[],
  selectedSources: number[],
  mode: "restore" | "baselines" = "restore",
) {
  const sources = [...new Set(selectedSources)].sort((a, b) => a - b);
  if (
    !rawInputs.length ||
    rawInputs.length > 100 ||
    !sources.length ||
    sources.length > 100 ||
    sources.some((n) => !Number.isInteger(n) || n < 1 || n > 2147483647)
  )
    throw new Error("Invalid archive scope or budget");
  const inputs = rawInputs
    .map((raw) => fusionInputSchema.parse(raw))
    .sort((a, b) => a.matchKey.localeCompare(b.matchKey));
  if (new Set(inputs.map((i) => i.matchKey)).size !== inputs.length)
    throw new Error("Duplicate archive match");
  const events = [...new Set(inputs.map((i) => i.matchKey.split("_")[0]))];
  if (events.length !== 1 || !/^2026[a-z0-9]+$/.test(events[0]!))
    throw new Error("Archive must cover one 2026 event");
  const groups =
    sources.length === 1 ? [sources] : [sources, ...sources.map((n) => [n])];
  if (inputs.length * groups.length > 500)
    throw new Error("Archive scope budget exceeded");
  const matches: string[] = [],
    slots: string[] = [],
    officials: string[] = [],
    rows: string[] = [];
  for (const input of inputs) {
    const truth = official.parse(input.tba);
    matches.push(`(${quote(input.matchKey)})`);
    for (const s of input.slots)
      slots.push(
        `(${quote(input.matchKey)},${s.teamNumber},${quote(s.alliance)},${s.station ?? "NULL::integer"})`,
      );
    for (const color of ["red", "blue"] as const)
      officials.push(
        `(${quote(input.matchKey)},${quote(color.toUpperCase())},${truth.alliances[color].score},${quote(JSON.stringify(truth.score_breakdown[color]))}::jsonb)`,
      );
    for (const sourceTeams of groups) {
      const estimate = fuseOfficialMatch(
        prepareFusion(input, sourceTeams, OFFICIAL_POLICY),
      );
      const scope = sha(JSON.stringify(sourceTeams));
      for (const team of estimate.alliances
        .flatMap((a) => a.teams)
        .sort((a, b) => a.teamNumber - b.teamNumber)) {
        rows.push(
          `(${[quote(input.matchKey), team.teamNumber, quote(scope), `ARRAY[${sourceTeams.join(",")}]::integer[]`, quote(estimate.algorithm), quote(estimate.semanticInputSha256), quote(estimate.attributionStatus), team.reports, team.autoFuelCount, team.autoPoints, team.teleopFuelCount, team.teleopPoints, team.estimatedFuel, team.estimatedPoints, quote("ARCHIVE"), averageScoutPoints(input.reports, team.teamNumber, sourceTeams) ?? "NULL"].join(",")})`,
        );
      }
    }
  }
  const expected = `expected_matches(key) AS (VALUES ${matches.join(",")}),
expected_slots("matchKey","teamNumber",alliance,station) AS (VALUES ${slots.join(",")}),
expected_official("matchKey",color,score,breakdown) AS (VALUES ${officials.join(",")}),
checks AS (SELECT
 (SELECT count(*) FROM expected_matches e JOIN "Match" m ON m.key=e.key AND m."tournamentKey"=${quote(events[0]!)}) AS matches,
 (SELECT count(*) FROM expected_slots e WHERE EXISTS (SELECT 1 FROM "TeamMatchData" t WHERE t."matchKey"=e."matchKey" AND t."teamNumber"=e."teamNumber" AND t.alliance::text=e.alliance AND (e.station IS NULL OR t.station=e.station))) AS slots,
 (SELECT count(*) FROM expected_official e WHERE EXISTS (SELECT 1 FROM "MatchAlliance" a WHERE a."matchKey"=e."matchKey" AND a.color::text=e.color AND a.score=e.score AND a."scoreBreakdown" @> e.breakdown)) AS officials,
 (SELECT count(*) FROM "ScoutReport" r JOIN "Scouter" s ON s.uuid=r."scouterUuid" JOIN "TeamMatchData" t ON t.key=r."teamMatchKey" JOIN expected_matches e ON e.key=t."matchKey" WHERE s."sourceTeamNumber" IN (${sources.join(",")})) AS reports)`;
  const verificationSql = `WITH ${expected} SELECT * FROM checks;\n`;
  const columns =
    '"matchKey","teamNumber","scopeKey","sourceTeams",algorithm,"inputSha256","attributionStatus","reportCount","autoFuel","autoPoints","teleopFuel","teleopPoints","totalFuel","totalPoints","inputOrigin","scoutPoints"';
  const assignments = columns
    .split(",")
    .filter((c) => !['"matchKey"', '"teamNumber"', '"scopeKey"'].includes(c))
    .map((c) => `${c}=EXCLUDED.${c}`)
    .join(",");
  const baselineUpdate = `
 IF EXISTS (WITH expected(${columns}) AS (VALUES ${rows.join(",\n")})
   SELECT 1 FROM expected s LEFT JOIN "EstimatedScore" e
   ON e."matchKey"=s."matchKey" AND e."teamNumber"=s."teamNumber" AND e."scopeKey"=s."scopeKey"
   WHERE e."inputOrigin" IS DISTINCT FROM 'ARCHIVE' OR e."inputSha256" IS DISTINCT FROM s."inputSha256"
     OR e."totalPoints" IS DISTINCT FROM s."totalPoints" OR e."reportCount" IS DISTINCT FROM s."reportCount") THEN
   RAISE EXCEPTION 'Archived estimates changed; no baselines updated';
 END IF;
 WITH expected(${columns}) AS (VALUES ${rows.join(",\n")})
 UPDATE "EstimatedScore" e SET "scoutPoints"=s."scoutPoints"::double precision FROM expected s
 WHERE e."matchKey"=s."matchKey" AND e."teamNumber"=s."teamNumber" AND e."scopeKey"=s."scopeKey";`;
  const restore = `INSERT INTO "EstimatedScore" (${columns}) VALUES ${rows.join(",\n")}
 ON CONFLICT ("matchKey","teamNumber","scopeKey") DO UPDATE SET ${assignments},"calculatedAt"=CURRENT_TIMESTAMP
 WHERE "EstimatedScore"."inputOrigin"='ARCHIVE';`;
  const body = `DECLARE verified RECORD;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(k.key,195)) FROM (VALUES ${matches.join(",")}) AS k(key) ORDER BY k.key;
 WITH ${expected} SELECT * INTO verified FROM checks;
 IF verified.matches <> ${inputs.length} OR verified.slots <> ${inputs.length * 6} OR verified.officials <> ${inputs.length * 2} OR verified.reports <> 0 THEN
   RAISE EXCEPTION 'Archive prerequisites changed; no estimates restored';
 END IF;
 ${mode === "baselines" ? baselineUpdate : restore}
END;`;
  const tag = `$archive_${sha(body).slice(0, 24)}$`;
  if (body.includes(tag)) throw new Error("Archive block delimiter collision");
  const sql = `DO ${tag}\n${body}\n${tag};\n`;
  return {
    sql,
    verificationSql,
    manifest: {
      eventKey: events[0],
      matches: inputs.length,
      teamMatches: inputs.length * 6,
      rows: rows.length,
      sourceScopes: groups,
      algorithm: "scoreboard-constrained-fusion-v5-tba-consensus",
      inputOrigin: "ARCHIVE",
      mode,
      sqlSha256: sha(sql),
      verificationSha256: sha(verificationSql),
    },
  };
}
