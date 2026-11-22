import { analysisBudget } from "../budget.js";
import { loadDetailedReports } from "../repository.js";
import { rankingSchema, type OfficialReader } from "../official.js";
import type { AnalysisRequest, AnalysisResponse } from "@lovat/api";
import { eventActions, eventPositions } from "@lovat/api";
import { z } from "zod";
import {
  legacyAnalysisScope as accessScope,
  type AccessScope,
} from "../auth.js";
import {
  ServiceRouter,
  input,
  user,
  positive,
  type Context,
} from "../http/router.js";
import { sourceFilter } from "./reports.js";
import { season2026 } from "../metrics/season2026.js";
import { analyzeReports } from "../metrics/engine.js";
import type { ReportInput } from "../metrics/facts.js";
import { HttpError } from "../errors.js";

export type Analyze = (
  scope: AccessScope,
  request: AnalysisRequest,
) => Promise<AnalysisResponse>;
const numeric = season2026
  .metadata()
  .filter((m) => m.kind === "number")
  .map((m) => m.id);
const categorical = season2026
  .metadata()
  .filter((m) => m.kind === "distribution")
  .map((m) => m.id);
const valid = {
  reliability: {
    in: ["VERIFIED", "UNVERIFIED"] as ("VERIFIED" | "UNVERIFIED")[],
  },
  training: false,
};
const fields = {
  robotRole: "robotRoles",
  fieldTraversal: "fieldTraversal",
  climbResult: "endgameClimb",
  beached: "beached",
  scoresWhileMoving: "scoresWhileMoving",
  disrupts: "disrupts",
  autoClimb: "autoClimb",
  feederType: "feederTypes",
  intakeType: "intakeType",
} as const;
type Breakdown = keyof typeof fields;
const roles = ["CYCLING", "SCORING", "FEEDING", "DEFENDING", "IMMOBILE"];
const climbs = ["NOT_ATTEMPTED", "L1", "L2", "L3", "FAILED"];
const autoClimbs = ["NOT_ATTEMPTED", "SUCCEEDED", "FAILED"];
export function parseJson<T>(
  schema: z.ZodType<T>,
  value: string | undefined,
  fallback: unknown,
): T {
  try {
    return input(schema, value === undefined ? fallback : JSON.parse(value));
  } catch {
    throw new HttpError(400, "INVALID_QUERY", "Invalid JSON query parameter");
  }
}
const scalar = (response: AnalysisResponse, team: number, id: string) => {
  const result =
    response.teams[String(team)]?.metrics[season2026.get(id).metadata.id]
      ?.value;
  return typeof result === "number" ? result : 0;
};
export function autoPath(report: {
  events: readonly {
    time: number;
    action: string;
    position: string;
    quantity: number | null;
    points: number;
  }[];
  teamMatchKey: string;
  autoClimb: string;
  teamMatchData: { tournament: { name: string } };
}) {
  const events = report.events
    .filter((e) => e.time <= 23)
    .sort((a, b) => a.time - b.time);
  return {
    autoPoints: events.reduce((sum, e) => sum + e.points, 0),
    positions: events.map((event) => ({
      location: eventPositions.indexOf(
        event.position as (typeof eventPositions)[number],
      ),
      event: eventActions.indexOf(
        event.action as (typeof eventActions)[number],
      ),
      time: event.time,
      quantity: event.quantity ?? 0,
    })),
    match: report.teamMatchKey,
    tournamentName: report.teamMatchData.tournament.name,
    climb: autoClimbs.indexOf(report.autoClimb),
  };
}
export function autoPaths(ctx: Context, team: number) {
  return analysisBudget(() => calculateAutoPaths(ctx, team));
}
async function calculateAutoPaths(ctx: Context, team: number) {
  const reports = await loadDetailedReports(ctx.db, accessScope(user(ctx)), {
    teamMatchData: { teamNumber: team },
  });
  const groups: {
    positions: ReturnType<typeof autoPath>["positions"];
    matches: { matchKey: string; tournamentName: string }[];
    score: number[];
    frequency: number;
    maxScore: number;
  }[] = [];
  for (const report of reports) {
    const path = autoPath(report);
    if (!path.positions.length) continue;
    const group = groups.find((g) => {
      const length = Math.min(g.positions.length, path.positions.length);
      return Array.from({ length }, (_, i) => i).every(
        (i) =>
          g.positions[i].event === path.positions[i].event &&
          g.positions[i].location === path.positions[i].location,
      );
    });
    if (group) {
      if (path.positions.length > group.positions.length)
        group.positions = path.positions;
      if (!group.matches.some((m) => m.matchKey === path.match))
        group.matches.push({
          matchKey: path.match,
          tournamentName: path.tournamentName,
        });
      group.score.push(path.autoPoints);
      group.frequency++;
      group.maxScore = Math.max(group.maxScore, path.autoPoints);
    } else
      groups.push({
        positions: path.positions,
        matches: [
          { matchKey: path.match, tournamentName: path.tournamentName },
        ],
        score: [path.autoPoints],
        frequency: 1,
        maxScore: path.autoPoints,
      });
  }
  return groups.sort(
    (a, b) => b.frequency - a.frequency || b.maxScore - a.maxScore,
  );
}
export function registerAnalysis(
  router: ServiceRouter,
  analyze: Analyze,
  official: OfficialReader,
) {
  const request = (
    ctx: Context,
    teams: number[],
    metrics: string[],
    timeline = false,
  ) =>
    analyze(accessScope(user(ctx)), { teams, metrics, timeline, season: 2026 });
  for (const [suffix, metrics] of [
    ["category", numeric],
    ["breakdown", categorical],
  ] as const) {
    router.add(
      "GET",
      "/v1/analysis/" + suffix + "/team/:team",
      "session",
      async (ctx) => {
        const team = input(positive, ctx.params.team);
        const response = await request(ctx, [team], [...metrics]);
        const result = response.teams[String(team)].metrics;
        if (!Object.values(result).some((v) => v.samples)) {
          return (await ctx.db.team.findUnique({
            where: { number: team },
            select: { number: true },
          }))
            ? "NO_DATA_FOR_TEAM"
            : "TEAM_DOES_NOT_EXIST";
        }
        return Object.fromEntries(
          Object.entries(result).map(([key, value]) => [key, value.value ?? 0]),
        );
      },
    );
  }
  router.add(
    "GET",
    "/v1/analysis/metric/:metric/team/:team",
    "session",
    async (ctx) => {
      const team = input(positive, ctx.params.team);
      let metric: string;
      try {
        metric = season2026.get(ctx.params.metric).metadata.id;
      } catch {
        throw new HttpError(400, "UNKNOWN_METRIC", "Unknown metric");
      }
      if (metric === "autoPoints") return { paths: await autoPaths(ctx, team) };
      const response = await request(ctx, [team], [metric], true);
      const timeline = response.teams[String(team)].timeline ?? [];
      const result = scalar(response, team, metric);
      const allTeams = await ctx.db.teamMatchData.groupBy({
        by: ["teamNumber"],
        where: {
          scoutReports: { some: { AND: [sourceFilter(ctx), valid] } },
          matchType: { not: "PRACTICE" },
        },
      });
      const teams = allTeams.map((row) => row.teamNumber);
      const population: number[] = [];
      if (teams.length) {
        const populationRequest = {
          teams,
          metrics: [metric],
          season: 2026,
          timeline: false,
        };
        const data = await analyze(accessScope(user(ctx)), populationRequest);
        for (const number of teams)
          if (data.teams[String(number)].metrics[metric].samples)
            population.push(scalar(data, number, metric));
      }
      const all = population.length
        ? population.reduce((sum, v) => sum + v, 0) / population.length
        : 0;
      const names = await ctx.db.tournament.findMany({
        where: { key: { in: timeline.map((p) => p.tournamentKey) } },
        select: { key: true, name: true },
        take: 5000,
      });
      const byKey = new Map(names.map((row) => [row.key, row.name]));
      return {
        array: timeline.map((point) => ({
          match: point.matchKey,
          dataPoint: point.metrics[metric].value ?? 0,
          tournamentName: byKey.get(point.tournamentKey) ?? point.tournamentKey,
        })),
        result,
        all,
        difference: result - all,
        team,
      };
    },
  );
  router.add(
    "GET",
    "/v1/analysis/breakdown/team/:team/:breakdown",
    "session",
    async (ctx) => {
      const team = input(positive, ctx.params.team);
      const breakdown = ctx.params.breakdown as Breakdown;
      const field = fields[breakdown];
      if (!field)
        throw new HttpError(
          400,
          "UNKNOWN_BREAKDOWN",
          "Unknown breakdown metric",
        );
      const rows = await ctx.db.scoutReport.findMany({
        where: {
          AND: [
            sourceFilter(ctx),
            valid,
            {
              teamMatchData: {
                teamNumber: team,
                matchType: { not: "PRACTICE" },
              },
            },
          ],
        },
        select: {
          teamMatchKey: true,
          robotRoles: true,
          fieldTraversal: true,
          endgameClimb: true,
          beached: true,
          scoresWhileMoving: true,
          disrupts: true,
          autoClimb: true,
          feederTypes: true,
          intakeType: true,
          scouter: { select: { sourceTeamNumber: true, name: true } },
          teamMatchData: { select: { tournament: { select: { name: true } } } },
        },
        orderBy: [
          { teamMatchData: { tournament: { date: "desc" } } },
          { startTime: "desc" },
        ],
        take: 5000,
      });
      return rows.flatMap((row) => {
        const value = row[field];
        const values = Array.isArray(value)
          ? value
          : [
              typeof value === "boolean"
                ? String(value).toUpperCase()
                : String(value),
            ];
        return values.map((value) => ({
          key: row.teamMatchKey,
          tournamentName: row.teamMatchData.tournament.name,
          breakdown: value,
          sourceTeam: row.scouter.sourceTeamNumber,
          scouter:
            row.scouter.sourceTeamNumber === user(ctx).teamNumber
              ? row.scouter.name
              : undefined,
        }));
      });
    },
  );
  router.add("GET", "/v1/analysis/notes/team/:team", "session", async (ctx) =>
    analysisBudget(async () => {
      const team = input(positive, ctx.params.team);
      const rows = await loadDetailedReports(
        ctx.db,
        accessScope(user(ctx)),
        { teamMatchData: { teamNumber: team }, notes: { not: "" } },
        { text: true, events: false },
      );
      return rows.map((row) => ({
        notes: row.notes,
        robotBrokeDescription: row.robotBrokeDescription,
        match: row.teamMatchKey,
        tournamentName: row.teamMatchData.tournament.name,
        sourceTeam: row.scouter.sourceTeamNumber,
        scouterName:
          row.scouter.sourceTeamNumber === user(ctx).teamNumber
            ? row.scouter.name
            : undefined,
      }));
    }),
  );
  router.add("GET", "/v1/analysis/flag/team/:team", "session", async (ctx) => {
    const flags = parseJson(z.array(z.string()).max(64), ctx.query.flags, []);
    const team = input(positive, ctx.params.team);
    const known = flags.filter(
      (f) =>
        f !== "rank" &&
        season2026.metadata().some((m) => m.id === f || m.aliases.includes(f)),
    );
    const response = known.length ? await request(ctx, [team], known) : null;
    const ranks =
      flags.includes("rank") && (ctx.query.tournamentKey || ctx.query.eventKey)
        ? ((
            await official(
              ctx.query.tournamentKey ?? ctx.query.eventKey ?? "",
              "rankings",
              rankingSchema,
            )
          ).rankings ?? [])
        : [];
    return flags.map((flag) =>
      flag === "rank"
        ? (ranks.find((r) => r.team_key === "frc" + team)?.rank ?? 0)
        : response && known.includes(flag)
          ? scalar(response, team, flag)
          : null,
    );
  });
  router.add(
    "GET",
    "/v1/analysis/timeline/scoutreport/:uuid",
    "session",
    async (ctx) => {
      const rows = await ctx.db.event.findMany({
        where: {
          scoutReportUuid: ctx.params.uuid,
          scoutReport: { AND: [sourceFilter(ctx), valid] },
        },
        orderBy: { time: "asc" },
        take: 10000,
      });
      return rows.map((event) => [
        event.time,
        eventActions.indexOf(event.action),
        eventPositions.indexOf(event.position),
        ...(["STOP_SCORING", "STOP_FEEDING"].includes(event.action)
          ? [event.quantity ?? event.points]
          : []),
      ]);
    },
  );
  router.add(
    "GET",
    "/v1/analysis/scoutreports/match/:match",
    "session",
    async (ctx) => {
      const rows = await ctx.db.scoutReport.findMany({
        where: {
          AND: [sourceFilter(ctx), valid, { teamMatchKey: ctx.params.match }],
        },
        select: {
          uuid: true,
          scouterUuid: true,
          startTime: true,
          notes: true,
          robotBrokeDescription: true,
          reliability: true,
          scouter: { select: { name: true, sourceTeamNumber: true } },
        },
        take: 1000,
      });
      return rows.map((r) => ({
        ...r,
        scouter: {
          ...r.scouter,
          name:
            r.scouter.sourceTeamNumber === user(ctx).teamNumber
              ? r.scouter.name
              : "Scouter from " + r.scouter.sourceTeamNumber,
        },
        canModify:
          r.scouter.sourceTeamNumber === user(ctx).teamNumber &&
          user(ctx).role === "SCOUTING_LEAD",
      }));
    },
  );
  router.add(
    "GET",
    "/v1/analysis/metrics/scoutreport/:uuid",
    "session",
    async (ctx) => {
      const report = await ctx.db.scoutReport.findFirst({
        where: { AND: [sourceFilter(ctx), valid, { uuid: ctx.params.uuid }] },
        include: {
          events: { orderBy: { time: "asc" } },
          teamMatchData: { include: { tournament: true } },
        },
      });
      if (!report) return {};
      const reportInput: ReportInput = {
        ...report,
        teamNumber: report.teamMatchData.teamNumber,
        matchKey: report.teamMatchKey,
        tournamentKey: report.teamMatchData.tournamentKey,
        tournamentDate: report.teamMatchData.tournament.date ?? "0000",
      };
      const response = analyzeReports(
        [reportInput],
        {
          teams: [reportInput.teamNumber],
          metrics: numeric,
          season: 2026,
          timeline: false,
        },
        season2026,
      );
      const number = (id: string) =>
        scalar(response, reportInput.teamNumber, id);
      return {
        totalPoints: Math.round(number("totalPoints")),
        autoPoints: number("autoPoints"),
        driverAbility: report.driverAbility,
        accuracy: report.accuracy,
        totalBallsFed: number("totalBallsFed"),
        volleys: number("volleysPerMatch"),
        defenseEffectiveness: report.defenseEffectiveness,
        robotRoles: report.robotRoles.map((r) => roles.indexOf(r)),
        climb: climbs.indexOf(report.endgameClimb),
        autoClimb: autoClimbs.indexOf(report.autoClimb),
        autoClimbStartTime:
          report.events.find((e) => e.action === "CLIMB" && e.time <= 23)
            ?.time ?? 0,
        contactDefenseTime: number("contactDefenseTime"),
        campingDefenseTime: number("campingDefenseTime"),
        totalDefenseTime: number("totalDefenseTime"),
        scoringRate: number("fuelPerSecond"),
        feedingRate: number("feedingRate"),
        feeds: number("feedsPerMatch"),
        feederType: report.feederTypes.map((f) =>
          ["CONTINUOUS", "STOP_TO_SHOOT", "DUMP"].indexOf(f),
        ),
        climbResult: climbs.indexOf(report.endgameClimb),
        climbStartTime: number("l1StartTime"),
        autoPath: autoPath(report),
        note: report.notes,
        robotBrokeDescription: report.robotBrokeDescription,
        timeStamp: report.startTime,
      };
    },
  );
}
