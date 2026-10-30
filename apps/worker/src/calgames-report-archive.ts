import { createHash } from "node:crypto";
import { z } from "zod";

const keys = {
  Season: ["year"],
  DistrictSeason: ["key"],
  Team: ["number"],
  Tournament: ["key"],
  TeamSeason: ["teamNumber", "seasonYear"],
  TeamTournament: ["teamNumber", "tournamentKey"],
  Match: ["key"],
  MatchAlliance: ["matchKey", "color"],
  TeamMatchData: ["key"],
  Scouter: ["uuid"],
  ScoutReport: ["uuid"],
  Event: ["eventUuid"],
} as const;
type Table = keyof typeof keys;
type Row = Record<string, unknown>;
const identifier = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const literal = (value: string) => {
  const tag =
    "$data_" +
    createHash("sha256").update(value).digest("hex").slice(0, 24) +
    "$";
  if (value.includes(tag)) throw Error("SQL delimiter collision");
  return tag + value + tag;
};

/** Offline, additive import preparation. Production is read only; the output
 * refuses another target account, cross-event data and conflicting raw rows.
 * Owner stubs never copy join codes, approval, accounts or credentials. */
export function buildCalgamesReportImport(raw: unknown, target: unknown) {
  const guard = z
    .object({
      userCount: z.number().int().positive(),
      team: z.number().int().positive(),
      username: z.string().min(1),
      email: z
        .string()
        .email()
        .refine((s) => s.endsWith("@example.invalid")),
    })
    .strict()
    .parse(target);
  const input = z.record(z.string(), z.unknown()).parse(raw);
  if (
    input.format !== "lovat-calgames-reports-v1" ||
    input.eventKey !== "2026cacg" ||
    Object.keys(input).some(
      (k) => !["format", "eventKey", ...Object.keys(keys)].includes(k),
    )
  )
    throw Error("Unexpected report archive");
  const data = {} as Record<Table, Row[]>;
  for (const table of Object.keys(keys) as Table[]) {
    const rows = z
      .array(z.record(z.string(), z.unknown()))
      .max(table === "Event" ? 500000 : 10000)
      .parse(input[table]);
    const columns = Object.keys(rows[0] ?? {}).sort();
    if (
      columns.some((c) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(c)) ||
      rows.some((r) => Object.keys(r).sort().join(",") !== columns.join(","))
    )
      throw Error(`Inconsistent ${table} columns`);
    const identities = rows.map((r) =>
      JSON.stringify(keys[table].map((k) => r[k])),
    );
    if (
      rows.some((r) =>
        keys[table].some((k) => !["string", "number"].includes(typeof r[k])),
      ) ||
      new Set(identities).size !== rows.length
    )
      throw Error(`Invalid ${table} identities`);
    data[table] = rows;
  }
  if (
    data.Tournament.length !== 1 ||
    data.Tournament[0]!.key !== "2026cacg" ||
    data.Tournament[0]!.seasonYear !== 2026 ||
    data.Tournament[0]!.name !== "CalGames" ||
    data.Tournament[0]!.parentTournamentKey
  )
    throw Error("Unexpected source tournament");
  if (!data.ScoutReport.length || !data.Event.length)
    throw Error("No source reports");
  for (const t of ["TeamTournament", "TeamMatchData", "Match"] as const)
    if (data[t].some((r) => r.tournamentKey !== "2026cacg"))
      throw Error("Cross-event data");
  if (
    data.Season.some((r) => r.year !== 2026) ||
    data.TeamSeason.some((r) => r.seasonYear !== 2026)
  )
    throw Error("Cross-season data");
  const slotIds = new Set(data.TeamMatchData.map((r) => r.key)),
    reportIds = new Set(data.ScoutReport.map((r) => r.uuid)),
    scoutIds = new Set(data.Scouter.map((r) => r.uuid)),
    matchIds = new Set(data.Match.map((r) => r.key));
  if (
    data.ScoutReport.some(
      (r) => !slotIds.has(r.teamMatchKey) || !scoutIds.has(r.scouterUuid),
    ) ||
    data.Event.some((r) => !reportIds.has(r.scoutReportUuid)) ||
    data.MatchAlliance.some((r) => !matchIds.has(r.matchKey))
  )
    throw Error("Missing source dependency");
  if (
    data.Scouter.some((r) =>
      Object.keys(r).some(
        (k) => !["uuid", "name", "sourceTeamNumber"].includes(k),
      ),
    )
  )
    throw Error("Unnecessary scouter data");
  const owners = [...new Set(data.Scouter.map((r) => r.sourceTeamNumber))];
  if (
    owners.some(
      (n) =>
        !Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 2147483647,
    )
  )
    throw Error("Invalid report owner");
  const json = JSON.stringify({ ...data });
  if (Buffer.byteLength(json) > 128 * 1024 * 1024)
    throw Error("Archive byte budget exceeded");
  const statements: string[] = [];
  for (const table of Object.keys(keys) as Table[]) {
    if (!data[table].length) continue;
    if (table === "Scouter")
      statements.push(
        `INSERT INTO "RegisteredTeam" (number,code,email,"emailVerified","teamApproved") VALUES ${owners.map((n) => `(${n},gen_random_uuid()::text,'preview-${n}@example.invalid',false,false)`).join(",")} ON CONFLICT (number) DO NOTHING;`,
      );
    const columns = Object.keys(data[table][0]!)
      .sort()
      .map(identifier)
      .join(",");
    const expected = `SELECT ${columns} FROM jsonb_populate_recordset(NULL::${identifier(table)},payload->'${table}')`;
    statements.push(
      `phase:='${table}'; INSERT INTO ${identifier(table)} (${columns}) ${expected} ON CONFLICT (${keys[table].map(identifier).join(",")}) DO NOTHING;`,
    );
    if (["Scouter", "ScoutReport", "Event"].includes(table)) {
      const join = keys[table]
        .map((k) => `t.${identifier(k)}=s.${identifier(k)}`)
        .join(" AND ");
      statements.push(
        `IF EXISTS (WITH expected AS (${expected}) SELECT 1 FROM expected s LEFT JOIN ${identifier(table)} t ON ${join} WHERE ${keys[table].map((k) => `t.${identifier(k)} IS NULL`).join(" OR ")} OR ROW(${Object.keys(
          data[table][0]!,
        )
          .sort()
          .map((k) => `t.${identifier(k)}`)
          .join(",")}) IS DISTINCT FROM ROW(${Object.keys(data[table][0]!)
          .sort()
          .map((k) => `s.${identifier(k)}`)
          .join(
            ",",
          )})) THEN RAISE EXCEPTION 'Conflicting source rows'; END IF;`,
      );
    }
    if (table === "TeamMatchData") {
      const fields = [
        "tournamentKey",
        "teamNumber",
        "matchKey",
        "matchType",
        "matchNumber",
        "alliance",
        "station",
        "externalParticipantKey",
      ].filter((k) => k in data.TeamMatchData[0]!);
      statements.push(
        `IF EXISTS (WITH expected AS (${expected}) SELECT 1 FROM expected s JOIN "TeamMatchData" t ON t.key=s.key WHERE ROW(${fields.map((k) => `t.${identifier(k)}`).join(",")}) IS DISTINCT FROM ROW(${fields.map((k) => `s.${identifier(k)}`).join(",")})) THEN RAISE EXCEPTION 'Conflicting report roster'; END IF;`,
      );
    }
  }
  const body = `DECLARE payload jsonb:=${literal(json)}::jsonb; target_guard jsonb:=${literal(JSON.stringify(guard))}::jsonb; phase text:='target verification';
BEGIN
 PERFORM set_config('lock_timeout','10s',true); PERFORM set_config('statement_timeout','240s',true);
 IF (SELECT count(*) FROM "User")<>(target_guard->>'userCount')::integer OR NOT EXISTS (SELECT 1 FROM "User" WHERE username=target_guard->>'username' AND role='ANALYST' AND "teamNumber"=(target_guard->>'team')::integer) OR NOT EXISTS (SELECT 1 FROM "RegisteredTeam" WHERE number=(target_guard->>'team')::integer AND email=target_guard->>'email') THEN RAISE EXCEPTION 'Unexpected preview target'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('report-import:2026cacg',195));
 ${statements.join("\n")}
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Report import aborted during % (%); no changes committed',phase,SQLSTATE;
END;`;
  const tag =
    "$import_" +
    createHash("sha256").update(body).digest("hex").slice(0, 24) +
    "$";
  if (body.includes(tag)) throw Error("Import delimiter collision");
  const sql = `BEGIN;\nSET LOCAL lock_timeout='10s';\nSET LOCAL statement_timeout='240s';\nDO ${tag}\n${body}\n${tag};\nCOMMIT;\n`;
  return {
    sql,
    manifest: {
      eventKey: "2026cacg",
      counts: Object.fromEntries(
        Object.entries(data).map(([t, r]) => [t, r.length]),
      ),
      sourceTeams: owners,
      sqlSha256: createHash("sha256").update(sql).digest("hex"),
      rawArchiveSha256: createHash("sha256").update(json).digest("hex"),
    },
  };
}
