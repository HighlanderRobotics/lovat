import { csv } from "../domain/prediction.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ServiceRouter,
  Reply,
  input,
  team,
  notFound,
  type Context,
} from "../http/router.js";
import { stationFields, stationSelect, shiftsFor } from "./collection.js";
import { HttpError } from "../errors.js";

const shiftShape = {
  startMatchOrdinalNumber: z.number().int().positive(),
  endMatchOrdinalNumber: z.number().int().positive(),
  team1: z.array(z.string()).max(20),
  team2: z.array(z.string()).max(20),
  team3: z.array(z.string()).max(20),
  team4: z.array(z.string()).max(20),
  team5: z.array(z.string()).max(20),
  team6: z.array(z.string()).max(20),
};
const shiftSchema = z
  .object(shiftShape)
  .refine(
    (s) => s.endMatchOrdinalNumber >= s.startMatchOrdinalNumber,
    "Shift end precedes its start",
  );
async function saveShift(ctx: Context, tournamentKey: string, uuid?: string) {
  const data = input(shiftSchema, ctx.body);
  const scouters = stationFields.flatMap((field) => data[field]);
  if (new Set(scouters).size !== scouters.length)
    throw new HttpError(
      400,
      "DUPLICATE_SCOUTER",
      "A scouter can occupy only one station per shift",
    );
  await ctx.db.$transaction(async (tx) => {
    // Team-row locking also protects an event's empty schedule against simultaneous inserts.
    await tx.$queryRaw`SELECT "number" FROM "RegisteredTeam" WHERE "number" = ${team(ctx)} FOR UPDATE`;
    const eligible = await tx.scouter.count({
      where: {
        uuid: { in: scouters },
        sourceTeamNumber: team(ctx),
        archived: false,
      },
    });
    if (eligible !== scouters.length)
      throw new HttpError(
        403,
        "INVALID_SCOUTER",
        "All scouters must be active members of this team",
      );
    const overlap = await tx.scouterScheduleShift.findFirst({
      where: {
        sourceTeamNumber: team(ctx),
        tournamentKey,
        ...(uuid ? { uuid: { not: uuid } } : {}),
        startMatchOrdinalNumber: { lte: data.endMatchOrdinalNumber },
        endMatchOrdinalNumber: { gte: data.startMatchOrdinalNumber },
      },
    });
    if (overlap)
      throw new HttpError(
        409,
        "OVERLAPPING_SHIFT",
        "Shift overlaps another shift",
      );
    const assignment = Object.fromEntries(
      stationFields.map((field) => [
        field,
        {
          ...(uuid ? { set: [] } : {}),
          connect: data[field].map((id) => ({ uuid: id })),
        },
      ]),
    );
    if (uuid)
      await tx.scouterScheduleShift.update({
        where: { uuid, sourceTeamNumber: team(ctx) },
        data: {
          startMatchOrdinalNumber: data.startMatchOrdinalNumber,
          endMatchOrdinalNumber: data.endMatchOrdinalNumber,
          ...assignment,
        },
      });
    else
      await tx.scouterScheduleShift.create({
        data: {
          tournamentKey,
          sourceTeamNumber: team(ctx),
          startMatchOrdinalNumber: data.startMatchOrdinalNumber,
          endMatchOrdinalNumber: data.endMatchOrdinalNumber,
          ...assignment,
        },
      });
  });
  return uuid
    ? "Scouter shift updated successfully"
    : "done adding scouter shift";
}
export function registerShifts(router: ServiceRouter) {
  router.add(
    "GET",
    "/v1/manager/scoutershifts/generate",
    "lead",
    async (ctx) => {
      const tournamentKey = input(
        z.string().min(1).max(100),
        ctx.query.tournamentKey,
      );
      const [matches, scouts, gaps] = await Promise.all([
        ctx.db.match.findMany({
          where: { tournamentKey, competitionLevel: "QUALIFICATION" },
          include: { teamSlots: true },
          orderBy: { matchNumber: "asc" },
          take: 1000,
        }),
        ctx.db.scouter.findMany({
          where: { sourceTeamNumber: team(ctx), archived: false },
          select: { uuid: true, name: true },
          orderBy: { uuid: "asc" },
          take: 1000,
        }),
        ctx.db.tournamentGap.findMany({
          where: { tournamentKey },
          select: { beforeMatchKey: true, type: true },
          take: 1000,
        }),
      ]);
      if (!matches.length) notFound("No schedule available");
      if (scouts.length < 3)
        throw new HttpError(
          409,
          "INSUFFICIENT_SCOUTERS",
          "At least three active scouts are required",
        );
      const counts = new Map<number, number>(),
        boundaries = new Map(gaps.map((g) => [g.beforeMatchKey, g.type]));
      let shift = 0,
        within = 0;
      const rows: Record<string, unknown>[] = [];
      for (const match of matches) {
        if (boundaries.has(match.key) || within === 10) {
          shift++;
          within = 0;
        }
        const chosen = match.teamSlots
          .map((s) => s.teamNumber)
          .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a - b)
          .slice(0, 3);
        const current = Array.from(
          { length: 3 },
          (_, i) => scouts[(shift * 3 + i) % scouts.length],
        );
        const row: Record<string, unknown> = {
          "Match Number": match.matchNumber,
        };
        for (let i = 0; i < 3; i++) {
          row["Scouter " + (i + 1)] = current[i].name ?? current[i].uuid;
          row["Team " + (i + 1)] = chosen[i] ?? "";
          if (chosen[i])
            counts.set(chosen[i], (counts.get(chosen[i]) ?? 0) + 1);
        }
        row["Expected Time"] = match.scheduledTime?.toISOString() ?? "";
        rows.push(row);
        within++;
      }
      return new Reply(
        csv(rows, [
          "Match Number",
          "Scouter 1",
          "Team 1",
          "Scouter 2",
          "Team 2",
          "Scouter 3",
          "Team 3",
          "Expected Time",
        ]),
        200,
        { "Content-Type": "text/csv" },
      );
    },
  );

  router.add(
    "GET",
    "/v1/manager/tournament/:tournament/scoutershifts",
    "verified",
    async (ctx) => {
      const data = await shiftsFor(ctx, team(ctx), ctx.params.tournament);
      return {
        data,
        hash: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
      };
    },
  );
  router.add(
    "POST",
    "/v1/manager/tournament/:tournament/scoutershifts",
    "lead",
    (ctx) => saveShift(ctx, ctx.params.tournament),
  );
  router.add("POST", "/v1/manager/scoutershifts/:uuid", "lead", async (ctx) => {
    const row = await ctx.db.scouterScheduleShift.findFirst({
      where: { uuid: ctx.params.uuid, sourceTeamNumber: team(ctx) },
    });
    if (!row) notFound();
    return saveShift(ctx, row.tournamentKey, row.uuid);
  });
  router.add(
    "DELETE",
    "/v1/manager/scoutershifts/:uuid",
    "lead",
    async (ctx) => {
      await ctx.db.scouterScheduleShift.delete({
        where: { uuid: ctx.params.uuid, sourceTeamNumber: team(ctx) },
      });
      return "Scouter shift deleted successfully";
    },
  );
  router.add("GET", "/v1/manager/scouterspage", "lead", async (ctx) => {
    const tournamentKey = ctx.query.tournamentKey;
    const archived =
      ctx.query.archived === undefined
        ? undefined
        : ctx.query.archived === "true";
    const sourceTeamNumber = team(ctx);
    const [scouters, reports, shifts, matchRows] = await Promise.all([
      ctx.db.scouter.findMany({
        where: { sourceTeamNumber, archived },
        select: { uuid: true, name: true },
        orderBy: { name: "asc" },
        take: 10000,
      }),
      ctx.db.scoutReport.groupBy({
        by: ["scouterUuid", "teamMatchKey"],
        where: {
          training: false,
          scouter: { sourceTeamNumber },
          ...(tournamentKey ? { teamMatchData: { tournamentKey } } : {}),
        },
      }),
      tournamentKey
        ? ctx.db.scouterScheduleShift.findMany({
            where: { sourceTeamNumber, tournamentKey },
            include: stationSelect,
            take: 1000,
          })
        : [],
      tournamentKey
        ? ctx.db.teamMatchData.groupBy({
            by: ["matchType", "matchNumber"],
            where: {
              tournamentKey,
              scoutReports: { some: { training: false } },
            },
          })
        : [],
    ]);
    const completed = matchRows.length;
    const counts = new Map<string, number>();
    for (const row of reports)
      counts.set(row.scouterUuid, (counts.get(row.scouterUuid) ?? 0) + 1);
    const assigned = new Map<string, number>();
    for (const shift of shifts) {
      const matches = Math.max(
        0,
        Math.min(completed, shift.endMatchOrdinalNumber) -
          shift.startMatchOrdinalNumber +
          1,
      );
      for (const field of stationFields)
        for (const scout of shift[field])
          assigned.set(scout.uuid, (assigned.get(scout.uuid) ?? 0) + matches);
    }
    return scouters.map((scout) => ({
      scouterUuid: scout.uuid,
      scouterName: scout.name,
      matchesScouted: counts.get(scout.uuid) ?? 0,
      missedMatches: Math.max(
        0,
        (assigned.get(scout.uuid) ?? 0) - (counts.get(scout.uuid) ?? 0),
      ),
    }));
  });
}
