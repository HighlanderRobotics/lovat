import { loadDetailedReports } from "../repository.js";
import { analysisBudget } from "../budget.js";
import { prediction } from "../domain/prediction.js";
import { HttpError } from "../errors.js";
import { z } from "zod";
import {
  ServiceRouter,
  input,
  identifier,
  positive,
  team,
  user,
  notFound,
} from "../http/router.js";
import { stationFields, stationSelect, matchTypes } from "./collection.js";
import { sourceFilter } from "./reports.js";
import { parseJson, type Analyze } from "./analysis.js";
import { rankingSchema, type OfficialReader } from "../official.js";
import { legacyAnalysisScope as accessScope } from "../auth.js";
import { analyzeReports } from "../metrics/engine.js";
import { season2026 } from "../metrics/season2026.js";

const statusSchema = z.record(
  z.string(),
  z.object({
    qual: z
      .object({
        ranking: z
          .object({
            rank: z.number().nullish(),
            ranking_points: z.number().nullish(),
            matches_played: z.number().nullish(),
            sort_orders: z.array(z.number()).nullish(),
          })
          .nullish(),
      })
      .nullish(),
  }),
);
export function registerEvents(
  router: ServiceRouter,
  analyze: Analyze,
  official: OfficialReader,
) {
  router.add(
    "GET",
    "/v1/manager/upcoming-entered-tournaments",
    "session",
    async (ctx) => {
      if (!user(ctx).teamNumber) return [];
      const rows = await ctx.db.tournament.findMany({
        where: {
          teams: { some: { teamNumber: user(ctx).teamNumber! } },
          startDate: { gte: new Date(Date.now() - 86400000) },
        },
        orderBy: [{ startDate: "asc" }, { key: "asc" }],
        take: 20,
      });
      return rows
        .filter((row) => {
          const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: row.timezone ?? "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).formatToParts(new Date());
          const get = (type: string) =>
            parts.find((p) => p.type === type)?.value;
          return (
            row.date !== null &&
            row.date > get("year") + "-" + get("month") + "-" + get("day")
          );
        })
        .slice(0, 2)
        .map((row) => ({
          key: row.key,
          name: row.name,
          city: row.location,
          startDate: row.date,
          week: row.week === null ? null : row.week + 1,
        }));
    },
  );
  router.add(
    "GET",
    "/v1/manager/tournament/:tournament/rankedTeams",
    "session",
    async (ctx) => {
      const event = input(identifier, ctx.params.tournament);
      const rows = await ctx.db.team.findMany({
        where: { matchData: { some: { tournamentKey: event } } },
        include: {
          seasons: {
            where: { seasonYear: Number(event.slice(0, 4)) },
            select: { avatar: true },
            take: 1,
          },
        },
        take: 1000,
      });
      if (!rows.length) notFound("Tournament or teams not found");
      const statuses = await official(event, "teams/statuses", statusSchema);
      return rows.map(({ seasons, ...row }) => {
        const rank = statuses["frc" + row.number]?.qual?.ranking;
        return {
          ...row,
          avatar: seasons[0]?.avatar ?? null,
          rank: rank?.rank ?? null,
          rankingPoints:
            rank?.ranking_points ??
            (rank?.sort_orders?.length &&
            rank.matches_played !== null &&
            rank.matches_played !== undefined
              ? Math.round(rank.sort_orders[0] * rank.matches_played)
              : null),
          matchesPlayed: rank?.matches_played ?? null,
        };
      });
    },
  );
  router.add(
    "GET",
    "/v1/manager/team-tournament-status",
    "verified",
    async (ctx) => {
      const data = input(
        z.object({ tournamentKey: identifier, teamNumber: positive }),
        ctx.query,
      );
      const [row, count, statuses] = await Promise.all([
        ctx.db.team.findUnique({
          where: { number: data.teamNumber },
          select: { number: true, name: true },
        }),
        ctx.db.teamMatchData.count({
          where: {
            tournamentKey: data.tournamentKey,
            teamNumber: data.teamNumber,
            matchType: "QUALIFICATION",
          },
        }),
        official(data.tournamentKey, "teams/statuses", statusSchema),
      ]);
      if (!row || !count) notFound("Team not in tournament");
      const r = statuses["frc" + row.number]?.qual?.ranking;
      return {
        ...row,
        rank: r?.rank ?? null,
        rankingPoints:
          r?.ranking_points ??
          (r?.sort_orders?.length && r.matches_played != null
            ? Math.round(r.sort_orders[0] * r.matches_played)
            : null),
        matchesPlayed: r?.matches_played ?? null,
        matchesTotal: count,
      };
    },
  );
  router.add(
    "GET",
    "/v1/manager/matches/:tournament",
    "verified",
    async (ctx) => {
      const event = input(identifier, ctx.params.tournament),
        filter = parseJson(z.array(positive).max(6), ctx.query.teams, []);
      const own = team(ctx),
        sources = sourceFilter(ctx);
      const [slots, shifts] = await Promise.all([
        ctx.db.teamMatchData.findMany({
          where: {
            tournamentKey: event,
            ...(ctx.query.includePractice === "true"
              ? {}
              : { matchType: { not: "PRACTICE" } }),
          },
          include: {
            match: { select: { status: true } },
            scoutReports: {
              where: {
                training: false,
                OR: [sources, { scouter: { sourceTeamNumber: own } }],
              },
              select: {
                scouter: {
                  select: { name: true, uuid: true, sourceTeamNumber: true },
                },
              },
            },
          },
          orderBy: [{ matchNumber: "asc" }, { key: "asc" }],
          take: 10000,
        }),
        ctx.db.scouterScheduleShift.findMany({
          where: { sourceTeamNumber: own, tournamentKey: event },
          include: stationSelect,
          take: 1000,
        }),
      ]);
      const lastQual = Math.max(
        0,
        ...slots
          .filter((s) => s.matchType === "QUALIFICATION")
          .map((s) => s.matchNumber),
      );
      const groups = new Map<string, typeof slots>();
      for (const slot of slots) {
        if (
          slot.matchType === "PRACTICE" &&
          !slot.practiceScheduled &&
          !slot.scoutReports.length
        )
          continue;
        const key = slot.matchType + ":" + slot.matchNumber;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(slot);
      }
      const rows = [...groups.values()].sort(
        (a, b) =>
          (a[0].matchType === "PRACTICE"
            ? -1
            : a[0].matchType === "QUALIFICATION"
              ? 0
              : 1) -
            (b[0].matchType === "PRACTICE"
              ? -1
              : b[0].matchType === "QUALIFICATION"
                ? 0
                : 1) || a[0].matchNumber - b[0].matchNumber,
      );
      return rows
        .filter((rows) =>
          filter.every((n) => rows.some((s) => s.teamNumber === n)),
        )
        .map((rows) => {
          rows.sort(
            (a, b) =>
              (a.alliance === "BLUE" ? 3 : 0) +
              (a.station ?? Number(a.key.at(-1))) -
              ((b.alliance === "BLUE" ? 3 : 0) +
                (b.station ?? Number(b.key.at(-1)))),
          );
          const first = rows[0],
            ordinal =
              first.matchType === "QUALIFICATION"
                ? first.matchNumber
                : lastQual + first.matchNumber;
          const shift = shifts.find(
            (s) =>
              s.startMatchOrdinalNumber <= ordinal &&
              s.endMatchOrdinalNumber >= ordinal,
          );
          const teams = rows.map((row, i) => {
            const ownReports = row.scoutReports.filter(
              (r) => r.scouter.sourceTeamNumber === own,
            );
            const scouters = ownReports.map((r) => ({
              name: r.scouter.name,
              scouted: true,
            }));
            for (const scout of first.matchType !== "PRACTICE"
              ? (shift?.[stationFields[i]] ?? [])
              : []) {
              if (!ownReports.some((r) => r.scouter.uuid === scout.uuid))
                scouters.push({ name: scout.name, scouted: false });
            }
            return {
              number: row.teamNumber,
              scouters,
              externalReports: row.scoutReports.length - ownReports.length,
            };
          });
          return {
            matchNumber: first.matchNumber,
            matchType: matchTypes[first.matchType],
            scouted: rows.some((s) => s.scoutReports.length > 0),
            finished: first.match?.status === "COMPLETED",
            ...(first.matchType === "PRACTICE"
              ? { teams }
              : Object.fromEntries(
                  teams.map((value, i) => ["team" + (i + 1), value]),
                )),
          };
        });
    },
  );
  router.add("GET", "/v1/manager/scouterreports", "lead", async (ctx) => {
    const data = input(
      z.object({
        scouterUuid: identifier.optional(),
        tournamentKey: identifier.optional(),
      }),
      ctx.query,
    );
    return ctx.db.scoutReport.findMany({
      where: {
        training: false,
        scouter: { sourceTeamNumber: team(ctx) },
        ...(data.scouterUuid ? { scouterUuid: data.scouterUuid } : {}),
        ...(data.tournamentKey
          ? { teamMatchData: { tournamentKey: data.tournamentKey } }
          : {}),
      },
      select: {
        uuid: true,
        teamMatchKey: true,
        startTime: true,
        reliability: true,
        scouter: { select: { uuid: true, name: true } },
        teamMatchData: {
          select: {
            key: true,
            teamNumber: true,
            matchType: true,
            matchNumber: true,
            tournamentKey: true,
            tournament: { select: { key: true, name: true } },
          },
        },
      },
      orderBy: { startTime: "desc" },
      take: 500,
    });
  });
  router.add("GET", "/v1/manager/match-results-page", "verified", async (ctx) =>
    analysisBudget(async () => {
      const key = input(identifier, ctx.query.matchKey);
      const metrics = [
        "totalPoints",
        "totalDefenseTime",
        "totalFuelOutputted",
        "autoPoints",
        "teleopPoints",
      ];
      const slots = await ctx.db.teamMatchData.findMany({
        where: {
          OR: [
            { matchKey: key },
            { key: { in: Array.from({ length: 6 }, (_, i) => key + "_" + i) } },
          ],
        },
        include: { tournament: true },
        take: 6,
      });
      if (slots.length !== 6) notFound("Match not found");
      const reports = await loadDetailedReports(
        ctx.db,
        accessScope(user(ctx)),
        { teamMatchKey: { in: slots.map((s) => s.key) } },
        { text: true },
      );
      const rows = slots.map((slot) => ({
        ...slot,
        scoutReports: reports.filter(
          (report) => report.teamMatchKey === slot.key,
        ),
      }));
      const results = rows.map((row) => {
        const reports = row.scoutReports.map((report) => ({
          ...report,
          teamNumber: row.teamNumber,
          matchKey: row.key,
          tournamentKey: row.tournamentKey,
          tournamentDate: row.tournament.date ?? "",
        }));
        const data = analyzeReports(
          reports,
          { teams: [row.teamNumber], metrics, season: 2026, timeline: false },
          season2026,
        ).teams[String(row.teamNumber)].metrics;
        return {
          row,
          values: Object.fromEntries(
            metrics.map((m) => [
              m,
              typeof data[m].value === "number" ? data[m].value : 0,
            ]),
          ),
        };
      });
      const alliance = (color: string) => {
        const selected = results.filter(
          (r) =>
            r.row.alliance === color ||
            (r.row.alliance === null &&
              Number(r.row.key.at(-1)) < 3 === (color === "RED")),
        );
        return {
          teams: selected.map(({ row, values }) => ({
            teamNumber: row.teamNumber,
            pointsScored: values.totalPoints,
            reports: row.scoutReports.map(({ scouter, events, ...report }) => ({
              ...report,
              scouterUuid:
                scouter.sourceTeamNumber === team(ctx)
                  ? report.scouterUuid
                  : undefined,
              events,
            })),
            role: [
              ...new Set(row.scoutReports.flatMap((r) => r.robotRoles)),
            ].map((r) =>
              [
                "CYCLING",
                "SCORING",
                "FEEDING",
                "DEFENDING",
                "IMMOBILE",
              ].indexOf(r),
            ),
          })),
          ...Object.fromEntries(
            metrics.map((m) => [
              m,
              selected.reduce((sum, r) => sum + r.values[m], 0),
            ]),
          ),
        };
      };
      return { red: alliance("RED"), blue: alliance("BLUE") };
    }),
  );
  router.add("GET", "/v1/analysis/pitdisplay", "session", async (ctx) => {
    const data = input(
      z.object({
        team: positive,
        tournamentKey: identifier,
        topTeamCount: z.coerce.number().int().min(0).max(100).default(10),
        teamsAboveCount: z.coerce.number().int().min(0).max(100).default(3),
      }),
      ctx.query,
    );
    const [matches, event, ranks] = await Promise.all([
      ctx.db.match.findMany({
        where: { tournamentKey: data.tournamentKey },
        include: { teamSlots: true },
        orderBy: { displayOrder: "asc" },
        take: 1000,
      }),
      official(
        data.tournamentKey,
        "",
        z.object({ webcasts: z.array(z.json()).default([]) }),
      ),
      official(data.tournamentKey, "rankings", rankingSchema),
    ]);
    if (
      !matches.some((m) => m.teamSlots.some((s) => s.teamNumber === data.team))
    )
      notFound("Team not in tournament");
    const rankRows = (ranks.rankings ?? []).map((r) => ({
      type: "team",
      number: Number(r.team_key.slice(3)),
      rank: r.rank,
      rankingPoints: r.extra_stats?.[0] ?? r.sort_orders?.[0] ?? 0,
    }));
    const index = rankRows.findIndex((r) => r.number === data.team);
    const rankingBlocks =
      index < data.topTeamCount + data.teamsAboveCount
        ? rankRows
        : [
            ...rankRows.slice(0, data.topTeamCount),
            {
              type: "collapsedDivider",
              teamCount: index - data.teamsAboveCount - data.topTeamCount,
            },
            ...rankRows.slice(index - data.teamsAboveCount),
          ];
    const current = matches.findIndex(
      (m) => !["COMPLETED", "CANCELED"].includes(m.status),
    );
    const next =
      current < 0
        ? -1
        : matches.findIndex(
            (m, i) =>
              i >= current &&
              m.status !== "COMPLETED" &&
              m.teamSlots.some((s) => s.teamNumber === data.team),
          );
    const chosen = [current, current < 0 ? -1 : current + 1, next].map(
      (i) => matches[i],
    );
    const teams = [
      ...new Set(
        chosen.flatMap((m) => m?.teamSlots.map((s) => s.teamNumber) ?? []),
      ),
    ];
    const predictionData = teams.length
      ? await analyze(accessScope(user(ctx)), {
          teams,
          metrics: ["totalPoints"],
          season: 2026,
          timeline: true,
        })
      : null;
    const format = (i: number) => {
      const match = matches[i];
      if (!match) return null;
      const red = match.teamSlots
        .filter((s) => s.alliance === "RED")
        .sort((a, b) => (a.station ?? 0) - (b.station ?? 0))
        .map((s) => s.teamNumber);
      const blue = match.teamSlots
        .filter((s) => s.alliance === "BLUE")
        .sort((a, b) => (a.station ?? 0) - (b.station ?? 0))
        .map((s) => s.teamNumber);
      let odds: ReturnType<typeof prediction> | undefined;
      if (predictionData) {
        try {
          odds = prediction(
            [...red, ...blue].map((team) =>
              (predictionData.teams[String(team)]?.timeline ?? []).flatMap(
                (point) =>
                  typeof point.metrics.totalPoints.value === "number"
                    ? [point.metrics.totalPoints.value]
                    : [],
              ),
            ),
          );
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 422)
            throw error;
        }
      }
      return {
        key: match.key,
        alliances: {
          red: { teams: red, winPrediction: odds?.redWinning },
          blue: { teams: blue, winPrediction: odds?.blueWinning },
        },
      };
    };
    const previous = matches.findLastIndex(
      (m, i) => i < next && m.teamSlots.some((s) => s.teamNumber === data.team),
    );
    return {
      matches: {
        nowPlaying: format(current),
        next: format(current < 0 ? -1 : current + 1),
        teamNext: format(next),
      },
      teamMatchTimeline:
        next >= 0
          ? {
              matchCount: next - Math.max(0, previous),
              currentMatchCount: current - Math.max(0, previous) + 1,
            }
          : {},
      webcasts: event.webcasts,
      rankingBlocks,
    };
  });
}
