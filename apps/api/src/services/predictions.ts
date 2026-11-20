import { rankingPoints2026, rules2026 } from "@lovat/games/2026";
import { analysisBudget } from "../budget.js";
import { loadDetailedReports } from "../repository.js";
import { z } from "zod";
import {
  ServiceRouter,
  Reply,
  input,
  user,
  positive,
  identifier,
  type Context,
} from "../http/router.js";
import { legacyAnalysisScope as accessScope } from "../auth.js";
import type { AnalysisResponse } from "@lovat/api";
import type { Analyze } from "./analysis.js";
import { autoPaths, parseJson } from "./analysis.js";
import { season2026 } from "../metrics/season2026.js";
import { analyzeReports } from "../metrics/engine.js";
import { sourceFilter } from "./reports.js";
import { prediction, csv } from "../domain/prediction.js";
import { rankingSchema, type OfficialReader } from "../official.js";
import { HttpError } from "../errors.js";
const names = ["red1", "red2", "red3", "blue1", "blue2", "blue3"] as const;
const numeric = season2026
  .metadata()
  .filter((m) => m.kind === "number")
  .map((m) => m.id);
const value = (data: AnalysisResponse, team: number, id: string) => {
  const n = data.teams[String(team)]?.metrics[id]?.value;
  return typeof n === "number" ? n : 0;
};
const weights: Record<string, string> = {
  totalPoints: "totalPoints",
  autoPoints: "autoPoints",
  teleopPoints: "teleopPoints",
  driverAbility: "driverAbility",
  autoClimb: "autoClimbStartTime",
  defenseEffectiveness: "defenseEffectiveness",
  contactDefenseTime: "contactDefenseTime",
  campingDefenseTime: "campingDefenseTime",
  totalDefensiveTime: "totalDefenseTime",
  totalFuelThroughput: "totalFuelOutputted",
  totalFuelFed: "totalBallsFed",
  feedingRate: "feedingRate",
  scoringRate: "fuelPerSecond",
};
const valid = {
  training: false,
  reliability: {
    in: ["VERIFIED", "UNVERIFIED"] as ("VERIFIED" | "UNVERIFIED")[],
  },
};
export function registerPredictions(
  router: ServiceRouter,
  analyze: Analyze,
  official: OfficialReader,
) {
  const calculate = (
    ctx: Context,
    teams: number[],
    metrics: string[],
    timeline = false,
  ) =>
    analyze(accessScope(user(ctx)), {
      teams: [...new Set(teams)],
      metrics,
      season: 2026,
      timeline,
    });
  const alliance = async (
    ctx: Context,
    teams: number[],
    data?: AnalysisResponse,
  ) => {
    const result =
      data ??
      (await calculate(ctx, teams, [
        "totalPoints",
        "robotRole",
        "l1StartTime",
        "l2StartTime",
        "l3StartTime",
        "totalFuelOutputted",
        "totalBallThroughput",
      ]));
    const paths = await Promise.all(teams.map((team) => autoPaths(ctx, team)));
    const sum = (metric: string) =>
      teams.reduce((s, team) => s + value(result, team, metric), 0);
    return {
      totalPoints: sum("totalPoints"),
      teams: teams.map((team, i) => {
        const distribution =
          result.teams[String(team)].metrics.robotRole?.value;
        const role =
          distribution &&
          typeof distribution === "object" &&
          !Array.isArray(distribution)
            ? Object.entries(distribution).sort(
                (a, b) => Number(b[1]) - Number(a[1]),
              )[0]?.[0]
            : "IMMOBILE";
        return {
          team,
          role: [
            "CYCLING",
            "SCORING",
            "FEEDING",
            "DEFENDING",
            "IMMOBILE",
          ].indexOf(role ?? "IMMOBILE"),
          averagePoints: value(result, team, "totalPoints"),
          paths: paths[i],
        };
      }),
      ...Object.fromEntries(
        ["l1StartTime", "l2StartTime", "l3StartTime"].map((metric) => [
          metric,
          teams.map((team) => value(result, team, metric) || null),
        ]),
      ),
      totalFuelOutputted: sum("totalFuelOutputted"),
      totalBallThroughput: sum("totalBallThroughput"),
    };
  };
  router.add("GET", "/v1/analysis/alliance", "session", async (ctx) =>
    alliance(
      ctx,
      ["team1", "team2", "team3"].map((name) =>
        input(positive, ctx.query[name]),
      ),
    ),
  );
  router.add("GET", "/v1/analysis/matchprediction", "session", async (ctx) => {
    const teams = names.map((name) => input(positive, ctx.query[name]));
    const data = await calculate(ctx, teams, ["totalPoints"], true);
    const odds = prediction(
      teams.map((team) =>
        (data.teams[String(team)].timeline ?? []).flatMap((point) => {
          const n = point.metrics.totalPoints.value;
          return typeof n === "number" ? [n] : [];
        }),
      ),
    );
    return {
      ...Object.fromEntries(names.map((name, i) => [name, teams[i]])),
      ...odds,
      redAlliance: await alliance(ctx, teams.slice(0, 3)),
      blueAlliance: await alliance(ctx, teams.slice(3)),
    };
  });
  router.add("GET", "/v1/analysis/picklist", "session", async (ctx) => {
    if (!ctx.query.tournamentKey) return { teams: [] };
    const event = input(identifier, ctx.query.tournamentKey);
    const slots = await ctx.db.teamMatchData.groupBy({
      by: ["teamNumber"],
      where: { tournamentKey: event, matchType: { not: "PRACTICE" } },
    });
    const teams = slots.map((s) => s.teamNumber);
    if (teams.length > 100)
      throw new HttpError(413, "TOO_MANY_TEAMS", "Select a smaller event");
    if (!teams.length) return { teams: [] };
    const active = Object.entries(weights)
      .map(([name, metric]) => ({
        name,
        metric,
        weight: input(
          z.coerce.number().finite().min(-1000).max(1000),
          ctx.query[name] ?? 0,
        ),
      }))
      .filter((w) => w.weight !== 0);
    if (!active.length)
      throw new HttpError(
        400,
        "EMPTY_WEIGHTS",
        "Choose at least one metric weight",
      );
    const flags = parseJson(z.array(z.string()).max(64), ctx.query.flags, []);
    const known = flags.filter((flag) => numeric.includes(flag));
    const data = await calculate(ctx, teams, [
      ...new Set([...active.map((w) => w.metric), ...known]),
    ]);
    const ranks = flags.includes("rank")
      ? ((await official(event, "rankings", rankingSchema)).rankings ?? [])
      : [];
    const stats = active.map((w) => {
      const values = teams.map((team) => value(data, team, w.metric)),
        mean = values.reduce((s, n) => s + n, 0) / values.length;
      return {
        ...w,
        mean,
        sd:
          Math.sqrt(
            values.reduce((s, n) => s + (n - mean) ** 2, 0) / values.length,
          ) || 0.1,
      };
    });
    return {
      teams: teams
        .map((team) => {
          const unweighted = stats.map((w) => ({
            type: w.name,
            result:
              value(data, team, w.metric) === 0
                ? 0
                : (value(data, team, w.metric) - w.mean) / w.sd,
          }));
          const breakdown = unweighted.map((w, i) => ({
            ...w,
            result: w.result * stats[i].weight,
          }));
          return {
            team,
            result: breakdown.reduce((s, w) => s + w.result, 0),
            breakdown,
            unweighted,
            flags: [
              ...known.map((flag) => ({
                type: flag,
                result: value(data, team, flag),
              })),
              ...(flags.includes("rank")
                ? [
                    {
                      type: "rank",
                      result:
                        ranks.find((r) => r.team_key === "frc" + team)?.rank ??
                        0,
                    },
                  ]
                : []),
            ],
          };
        })
        .sort((a, b) => b.result - a.result || a.team - b.team),
    };
  });
  router.add(
    "GET",
    "/v1/analysis/qualrankingprediction",
    "session",
    async (ctx) => {
      const event = input(identifier, ctx.query.tournamentKey);
      const matches = await ctx.db.match.findMany({
        where: { tournamentKey: event, competitionLevel: "QUALIFICATION" },
        include: { teamSlots: true, alliances: true },
        orderBy: { displayOrder: "asc" },
        take: 1000,
      });
      const teams = [
        ...new Set(
          matches.flatMap((m) => m.teamSlots.map((s) => s.teamNumber)),
        ),
      ];
      if (!teams.length) return [];
      if (teams.length > 100)
        throw new HttpError(413, "TOO_MANY_TEAMS", "Select a smaller event");
      const data = await calculate(ctx, teams, ["totalPoints"], true);
      const rankings = new Map(
        teams.map((teamNumber) => [
          teamNumber,
          {
            teamNumber,
            wins: 0,
            losses: 0,
            ties: 0,
            rankingPoints: 0,
            matchesPlayed: 0,
            combinedScore: 0,
            averageScore: 0,
            highScore: 0,
          },
        ]),
      );
      for (const match of matches) {
        const red = match.teamSlots
            .filter((s) => s.alliance === "RED")
            .map((s) => s.teamNumber),
          blue = match.teamSlots
            .filter((s) => s.alliance === "BLUE")
            .map((s) => s.teamNumber);
        if (red.length !== 3 || blue.length !== 3) continue;
        const completed = match.status === "COMPLETED";
        let winner = match.winningAlliance;
        if (!completed) {
          const odds = prediction(
            [...red, ...blue].map((team) =>
              (data.teams[String(team)].timeline ?? []).flatMap((p) =>
                typeof p.metrics.totalPoints.value === "number"
                  ? [p.metrics.totalPoints.value]
                  : [],
              ),
            ),
          );
          winner = odds.winningAlliance === 0 ? "RED" : "BLUE";
        }
        for (const [color, allianceTeams] of [
          ["RED", red],
          ["BLUE", blue],
        ] as const) {
          const officialAlliance = match.alliances.find(
            (a) => a.color === color,
          );
          const score = completed
            ? (officialAlliance?.score ?? 0)
            : allianceTeams.reduce(
                (s, t) => s + value(data, t, "totalPoints"),
                0,
              ) * rules2026.ranking.forecastScale;
          const breakdown = officialAlliance?.scoreBreakdown;
          const recordedRp =
            breakdown &&
            typeof breakdown === "object" &&
            !Array.isArray(breakdown) &&
            typeof breakdown.rp === "number"
              ? breakdown.rp
              : 0;
          const projected = allianceTeams.reduce(
            (s, t) => s + value(data, t, "totalPoints"),
            0,
          );
          const rp = completed
            ? recordedRp
            : rankingPoints2026(
                projected,
                winner === null ? "tie" : winner === color ? "win" : "loss",
              );
          for (const team of allianceTeams) {
            const row = rankings.get(team)!;
            row.matchesPlayed++;
            row.combinedScore += score;
            row.highScore = Math.max(row.highScore, score);
            row.rankingPoints += rp;
            if (!winner) row.ties++;
            else if (winner === color) row.wins++;
            else row.losses++;
          }
        }
      }
      return [...rankings.values()]
        .map((r) => ({
          ...r,
          averageScore: r.combinedScore / (r.matchesPlayed || 1),
        }))
        .sort(
          (a, b) =>
            b.rankingPoints - a.rankingPoints ||
            b.averageScore - a.averageScore ||
            b.highScore - a.highScore ||
            a.teamNumber - b.teamNumber,
        );
    },
  );
  router.add("GET", "/v1/analysis/csvplain", "verified", async (ctx) => {
    const event = input(identifier, ctx.query.tournamentKey);
    const slots = await ctx.db.teamMatchData.groupBy({
      by: ["teamNumber"],
      where: {
        tournamentKey: event,
        matchType: { not: "PRACTICE" },
        scoutReports: { some: { AND: [sourceFilter(ctx), valid] } },
      },
    });
    const teams = slots.map((s) => s.teamNumber);
    if (teams.length > 100)
      throw new HttpError(413, "TOO_MANY_TEAMS", "Select a smaller event");
    if (!teams.length)
      return new Reply(csv([], ["teamNumber", ...numeric]), 200, {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="teamDataDownload.csv"',
      });
    const scope = accessScope(user(ctx));
    if (
      (scope.sources.tournaments.mode === "EXCLUDE" &&
        !scope.sources.tournaments.items.includes(event)) ||
      (scope.sources.tournaments.mode === "INCLUDE" &&
        scope.sources.tournaments.items.includes(event))
    ) {
      scope.sources.tournaments = { mode: "INCLUDE", items: [event] };
    } else
      throw new HttpError(
        403,
        "SOURCE_FORBIDDEN",
        "Event is outside your data sources",
      );
    let data: AnalysisResponse;
    if (ctx.query.auto !== undefined || ctx.query.teleop !== undefined) {
      data = await analysisBudget(async () => {
        const reports = await loadDetailedReports(ctx.db, scope, {
          teamMatchData: { tournamentKey: event },
        });
        const auto = ctx.query.auto !== undefined,
          teleop = ctx.query.teleop !== undefined;
        const selected = reports.map((report) => ({
          ...report,
          teamNumber: report.teamMatchData.teamNumber,
          matchKey: report.teamMatchKey,
          tournamentKey: event,
          tournamentDate: report.teamMatchData.tournament.date ?? "",
          autoClimb: auto ? report.autoClimb : "NOT_ATTEMPTED",
          endgameClimb: teleop ? report.endgameClimb : "NOT_ATTEMPTED",
          events: report.events.filter((e) =>
            auto && !teleop
              ? e.time <= rules2026.autoEnd
              : teleop && !auto
                ? e.time > rules2026.autoEnd
                : true,
          ),
        }));
        return analyzeReports(
          selected,
          { teams, metrics: numeric, season: 2026, timeline: false },
          season2026,
        );
      });
    } else
      data = await analyze(scope, {
        teams,
        metrics: numeric,
        season: 2026,
        timeline: false,
      });

    return new Reply(
      csv(
        teams.map((team) => ({
          teamNumber: team,
          ...Object.fromEntries(
            numeric.map((id) => [id, value(data, team, id)]),
          ),
        })),
        ["teamNumber", ...numeric],
      ),
      200,
      {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="teamDataDownload.csv"',
      },
    );
  });
  router.add("GET", "/v1/analysis/reportcsv", "verified", async (ctx) =>
    analysisBudget(async () => {
      const event = input(identifier, ctx.query.tournamentKey);
      const reports = await loadDetailedReports(
        ctx.db,
        accessScope(user(ctx)),
        { teamMatchData: { tournamentKey: event } },
        { text: true },
      );
      const rows = reports.map((report) => {
        const team = report.teamMatchData.teamNumber;
        const events = report.events.filter((e) =>
          ctx.query.auto !== undefined && ctx.query.teleop === undefined
            ? e.time <= rules2026.autoEnd
            : ctx.query.teleop !== undefined && ctx.query.auto === undefined
              ? e.time > rules2026.autoEnd
              : true,
        );
        const data = analyzeReports(
          [
            {
              ...report,
              autoClimb:
                ctx.query.teleop !== undefined && ctx.query.auto === undefined
                  ? "NOT_ATTEMPTED"
                  : report.autoClimb,
              endgameClimb:
                ctx.query.auto !== undefined && ctx.query.teleop === undefined
                  ? "NOT_ATTEMPTED"
                  : report.endgameClimb,
              events,
              teamNumber: team,
              matchKey: report.teamMatchKey,
              tournamentKey: event,
              tournamentDate: report.teamMatchData.tournament.date ?? "",
            },
          ],
          { teams: [team], metrics: numeric, season: 2026, timeline: false },
          season2026,
        );
        return {
          uuid: report.uuid,
          teamNumber: team,
          match: report.teamMatchKey,
          sourceTeam: report.scouter.sourceTeamNumber,
          scouter:
            report.scouter.sourceTeamNumber === user(ctx).teamNumber
              ? report.scouter.name
              : "",
          notes: report.notes,
          ...Object.fromEntries(
            numeric.map((id) => [id, value(data, team, id)]),
          ),
        };
      });
      return new Reply(
        csv(rows, [
          "uuid",
          "teamNumber",
          "match",
          "sourceTeam",
          "scouter",
          "notes",
          ...numeric,
        ]),
        200,
        {
          "Content-Type": "text/csv",
          "Content-Disposition":
            'attachment; filename="reportDataDownload.csv"',
        },
      );
    }),
  );
}
