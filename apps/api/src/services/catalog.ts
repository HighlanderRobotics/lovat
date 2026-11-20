import { z } from "zod";
import {
  ServiceRouter,
  input,
  pageSchema,
  user,
  notFound,
} from "../http/router.js";

export function registerCatalog(router: ServiceRouter) {
  router.add("GET", "/v1/manager/teams", "session", async (ctx) => {
    const page = input(pageSchema, ctx.query);
    const pattern = (page.filter ?? "") + "%";
    const [teams, counts] = await Promise.all([
      ctx.db.$queryRaw<
        { number: number; name: string }[]
      >`SELECT "number", "name" FROM "Team"
        WHERE "number"::text LIKE ${pattern} OR "name" ILIKE ${pattern}
        ORDER BY "number" LIMIT ${page.take} OFFSET ${page.skip}`,
      ctx.db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "Team"
        WHERE "number"::text LIKE ${pattern} OR "name" ILIKE ${pattern}`,
    ]);
    const own = teams.findIndex((row) => row.number === user(ctx).teamNumber);
    if (own > 0) teams.unshift(...teams.splice(own, 1));
    return { teams, count: Number(counts[0]?.count ?? 0) };
  });
  router.add("GET", "/v1/manager/tournaments", "session", async (ctx) => {
    const page = input(pageSchema, ctx.query);
    const where = page.filter
      ? {
          OR: [
            { key: { contains: page.filter, mode: "insensitive" as const } },
            { name: { contains: page.filter, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [rows, count, participated] = await Promise.all([
      ctx.db.tournament.findMany({
        where,
        take: page.take,
        skip: page.skip,
        orderBy: [{ date: "asc" }, { key: "asc" }],
      }),
      ctx.db.tournament.count({ where }),
      user(ctx).teamNumber
        ? ctx.db.teamMatchData.groupBy({
            by: ["tournamentKey"],
            where: { teamNumber: user(ctx).teamNumber! },
          })
        : [],
    ]);
    const keys = new Set(participated.map((row) => row.tournamentKey));
    const tournaments = rows.map((row) => ({
      ...row,
      isParticipant: keys.has(row.key),
    }));
    tournaments.sort(
      (a, b) => Number(b.isParticipant) - Number(a.isParticipant),
    );
    return { tournaments, count };
  });
  router.add(
    "GET",
    "/v1/manager/tournament/:tournament/teams",
    "session",
    async (ctx) =>
      ctx.db.team.findMany({
        where: {
          matchData: {
            some: {
              tournamentKey: ctx.params.tournament,
              matchType: { not: "PRACTICE" },
            },
          },
        },
        orderBy: { number: "asc" },
        take: 1000,
      }),
  );
  router.add("GET", "/v1/manager/checkmatch", "public", async (ctx) => {
    const data = input(
      z
        .object({
          tournamentKey: z.string().min(1),
          teamNumber: z.coerce.number().int().positive(),
          matchNumber: z.coerce.number().int().positive(),
          matchType: z
            .enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"])
            .optional(),
          isElim: z.enum(["true", "false"]).optional(),
        })
        .refine((v) => v.matchType || v.isElim !== undefined),
      ctx.query,
    );
    const matchType =
      data.matchType ??
      (data.isElim === "true" ? "ELIMINATION" : "QUALIFICATION");
    const match = await ctx.db.teamMatchData.findFirst({
      where: {
        tournamentKey: data.tournamentKey,
        teamNumber: data.teamNumber,
        matchNumber: data.matchNumber,
        matchType,
        ...(matchType === "PRACTICE" ? { practiceScheduled: true } : {}),
      },
    });
    if (!match) notFound("MATCH_NOT_FOUND");
    return {
      match,
      alliance:
        matchType === "PRACTICE"
          ? null
          : (match.alliance?.toLowerCase() ??
            (Number(match.key.at(-1)) < 3 ? "red" : "blue")),
    };
  });
}
