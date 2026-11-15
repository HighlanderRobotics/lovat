import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ServiceRouter,
  input,
  pageSchema,
  notFound,
  type Context,
} from "../http/router.js";
import { HttpError } from "../errors.js";

export const stationFields = [
  "team1",
  "team2",
  "team3",
  "team4",
  "team5",
  "team6",
] as const;
export const stationSelect = {
  team1: { select: { uuid: true, name: true } },
  team2: { select: { uuid: true, name: true } },
  team3: { select: { uuid: true, name: true } },
  team4: { select: { uuid: true, name: true } },
  team5: { select: { uuid: true, name: true } },
  team6: { select: { uuid: true, name: true } },
} as const;
export const matchTypes = {
  QUALIFICATION: 0,
  ELIMINATION: 1,
  PRACTICE: 2,
} as const;
export async function shiftsFor(
  ctx: Context,
  sourceTeamNumber: number,
  tournamentKey: string,
) {
  return ctx.db.scouterScheduleShift.findMany({
    where: { sourceTeamNumber, tournamentKey },
    include: stationSelect,
    orderBy: { startMatchOrdinalNumber: "asc" },
    take: 1000,
  });
}
export async function collectionSchedule(ctx: Context) {
  const tournamentKey = ctx.params.tournament;
  const [shifts, slots] = await Promise.all([
    shiftsFor(ctx, ctx.collectionTeam!, tournamentKey),
    ctx.db.teamMatchData.findMany({
      where: { tournamentKey, matchType: { not: "PRACTICE" } },
      orderBy: [{ matchNumber: "asc" }, { key: "asc" }],
      take: 10000,
    }),
  ]);
  const lastQual = Math.max(
    0,
    ...slots
      .filter((s) => s.matchType === "QUALIFICATION")
      .map((s) => s.matchNumber),
  );
  if (!lastQual)
    throw new HttpError(
      404,
      "MATCHES_NOT_AVAILABLE",
      "Matches are not available for this tournament",
    );
  const matches = new Map<string, typeof slots>();
  for (const row of slots) {
    const key = row.matchType + ":" + row.matchNumber;
    if (!matches.has(key)) matches.set(key, []);
    matches.get(key)!.push(row);
  }
  const data = [];
  for (const shift of shifts)
    for (
      let ordinal = shift.startMatchOrdinalNumber;
      ordinal <= shift.endMatchOrdinalNumber;
      ordinal++
    ) {
      const elim = ordinal > lastQual;
      const matchNumber = elim ? ordinal - lastQual : ordinal;
      const rows = matches.get(
        (elim ? "ELIMINATION" : "QUALIFICATION") + ":" + matchNumber,
      );
      if (!rows?.length) continue;
      if (rows.length !== 6)
        throw new HttpError(
          409,
          "INCOMPLETE_MATCH",
          "Match assignments are incomplete",
        );
      const scouters: Record<string, { team: number; alliance: string }> = {};
      rows.sort((a, b) => Number(a.key.at(-1)) - Number(b.key.at(-1)));
      for (let station = 0; station < 6; station++) {
        for (const scouter of shift[stationFields[station]])
          scouters[scouter.uuid] = {
            team: rows[station].teamNumber,
            alliance: station < 3 ? "red" : "blue",
          };
      }
      data.push({ matchNumber, matchType: elim ? 1 : 0, scouters });
    }
  return {
    hash: createHash("sha256").update(JSON.stringify(shifts)).digest("hex"),
    data,
  };
}
export function registerCollection(router: ServiceRouter) {
  const checkCode = async (ctx: Context) => {
    const code = input(z.string().min(1).max(256), ctx.query.code);
    return (
      (await ctx.db.registeredTeam.findUnique({
        where: { code },
        select: { number: true, emailVerified: true, teamApproved: true },
      })) ?? false
    );
  };
  const listScouters = async (ctx: Context) =>
    ctx.db.scouter.findMany({
      where: { sourceTeamNumber: ctx.collectionTeam!, archived: false },
      orderBy: { name: "asc" },
      take: 10000,
    });
  const addScout = async (ctx: Context) => {
    const data = input(
      z.object({
        name: z.string().trim().min(1).max(200),
        teamNumber: z.number().int().positive(),
      }),
      ctx.body,
    );
    if (data.teamNumber !== ctx.collectionTeam)
      throw new HttpError(
        403,
        "TEAM_MISMATCH",
        "Scout must belong to this team",
      );
    return ctx.db.scouter.create({
      data: { sourceTeamNumber: ctx.collectionTeam, name: data.name },
    });
  };
  const tournaments = async (ctx: Context) => {
    const page = input(pageSchema, ctx.query);
    const year = new Date().getUTCFullYear();
    const where = {
      seasonYear: year,
      ...(page.filter
        ? {
            OR: [
              { key: { contains: page.filter } },
              { name: { contains: page.filter } },
            ],
          }
        : {}),
    };
    const [rows, count, own] = await Promise.all([
      ctx.db.tournament.findMany({
        where,
        take: page.take,
        skip: page.skip,
        orderBy: [{ date: "asc" }, { key: "asc" }],
      }),
      ctx.db.tournament.count({ where }),
      ctx.db.teamMatchData.groupBy({
        by: ["tournamentKey"],
        where: { teamNumber: ctx.collectionTeam },
      }),
    ]);
    const keys = new Set(own.map((row) => row.tournamentKey));
    rows.sort((a, b) => Number(keys.has(b.key)) - Number(keys.has(a.key)));
    return { tournaments: rows, count };
  };
  for (const prefix of ["/collection", "/v2/collection"]) {
    router.add("GET", prefix + "/checkcode", "public", checkCode);
    router.add("GET", prefix + "/scouter", "collection", listScouters);
    router.add("POST", prefix + "/scouter", "collection", addScout);
    router.add("GET", prefix + "/tournament", "collection", tournaments);
    router.add(
      "GET",
      prefix + "/schedules/:tournament",
      "collection",
      collectionSchedule,
    );
  }
  router.add("GET", "/v1/manager/scouter/checkcode", "public", checkCode);
  router.add("GET", "/v1/manager/scouters", "collection", listScouters);
  router.add("POST", "/v1/manager/scouter", "collection", addScout);
  router.add(
    "GET",
    "/v1/manager/scouters/:uuid/tournaments",
    "collection",
    tournaments,
  );
  router.add(
    "GET",
    "/v1/manager/scouterschedules/:tournament",
    "collection",
    collectionSchedule,
  );
  router.add(
    "GET",
    "/v1/manager/scouter/tournaments",
    "collection",
    async (ctx) =>
      ctx.db.tournament.findMany({
        where: {
          scouterScheduleShifts: {
            some: { sourceTeamNumber: ctx.collectionTeam },
          },
        },
        orderBy: { date: "asc" },
        take: 5000,
      }),
  );
  router.add(
    "POST",
    "/v1/manager/name/uuid/:uuid",
    "collection",
    async (ctx) => {
      const data = input(
        z.object({ name: z.string().trim().min(1).max(200) }),
        ctx.body,
      );
      const scout = await ctx.db.scouter.findFirst({
        where: {
          uuid: ctx.params.uuid,
          sourceTeamNumber: ctx.collectionTeam,
          archived: false,
        },
      });
      if (!scout) notFound();
      await ctx.db.scouter.update({
        where: { uuid: scout.uuid, sourceTeamNumber: ctx.collectionTeam },
        data,
      });
      return "done changing name to provided scouter";
    },
  );
  router.add(
    "GET",
    "/v1/manager/matchschedule/:tournament",
    "collection",
    async (ctx) => {
      const slots = await ctx.db.teamMatchData.findMany({
        where: {
          tournamentKey: ctx.params.tournament,
          OR: [
            { matchType: { not: "PRACTICE" } },
            { matchType: "PRACTICE", practiceScheduled: true },
          ],
        },
        select: {
          teamNumber: true,
          matchNumber: true,
          matchType: true,
          key: true,
          alliance: true,
        },
        orderBy: [{ matchType: "asc" }, { matchNumber: "asc" }, { key: "asc" }],
        take: 10000,
      });
      const matches = new Map<
        string,
        {
          matchNumber: number;
          matchType: number;
          teams: { number: number; alliance: string | null }[];
        }
      >();
      for (const row of slots) {
        const key = row.matchType + ":" + row.matchNumber;
        if (!matches.has(key))
          matches.set(key, {
            matchNumber: row.matchNumber,
            matchType: matchTypes[row.matchType],
            teams: [],
          });
        matches.get(key)!.teams.push({
          number: row.teamNumber,
          alliance:
            row.matchType === "PRACTICE"
              ? null
              : (row.alliance?.toLowerCase() ??
                (Number(row.key.at(-1)) < 3 ? "red" : "blue")),
        });
      }
      return {
        tournamentKey: ctx.params.tournament,
        matches: [...matches.values()],
      };
    },
  );
}
