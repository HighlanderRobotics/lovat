import { z } from "zod";
import {
  ServiceRouter,
  input,
  team,
  user,
  writable,
  notFound,
  type Context,
} from "../http/router.js";

const weightNames = [
  "totalPoints",
  "autoPoints",
  "teleopPoints",
  "climbResult",
  "autoClimb",
  "defenseEffectiveness",
  "driverAbility",
  "contactDefenseTime",
  "campingDefenseTime",
  "totalDefensiveTime",
  "totalFuelThroughput",
  "totalFuelFed",
  "feedingRate",
  "scoringRate",
  "estimatedSuccessfulFuelRate",
  "estimatedTotalFuelScored",
] as const;
const weightShape = Object.fromEntries(
  weightNames.map((name) => [name, z.number().default(0)]),
) as Record<(typeof weightNames)[number], z.ZodDefault<z.ZodNumber>>;
const sharedSchema = z.object({
  name: z.string().min(1).max(200),
  ...weightShape,
});
const mutableSchema = z.object({
  name: z.string().min(1).max(200),
  teams: z.array(z.number().int().nonnegative()).max(1000),
  tournamentKey: z.string().optional(),
});
export function registerPicklists(router: ServiceRouter) {
  for (const mutable of [false, true]) {
    const path = mutable
      ? "/v1/manager/mutablepicklists"
      : "/v1/manager/picklists";
    const label = mutable ? "mutable picklist" : "picklist";
    const scope = (ctx: Context) => ({ author: { teamNumber: team(ctx) } });
    router.add("GET", path, "verified", async (ctx) =>
      mutable
        ? ctx.db.mutablePicklist.findMany({
            where: scope(ctx),
            select: {
              name: true,
              uuid: true,
              tournamentKey: true,
              author: { select: { username: true } },
            },
            take: 1000,
          })
        : ctx.db.sharedPicklist.findMany({
            where: scope(ctx),
            select: {
              name: true,
              uuid: true,
              author: { select: { username: true } },
            },
            take: 1000,
          }),
    );
    router.add("GET", path + "/:uuid", "verified", async (ctx) => {
      const where = { uuid: ctx.params.uuid, ...scope(ctx) };
      const row = mutable
        ? await ctx.db.mutablePicklist.findFirst({ where })
        : await ctx.db.sharedPicklist.findFirst({ where });
      return row ?? notFound("Picklist not found");
    });
    router.add("POST", path, "verified", async (ctx) => {
      writable(ctx);
      team(ctx);
      if (mutable)
        await ctx.db.mutablePicklist.create({
          data: { ...input(mutableSchema, ctx.body), authorId: user(ctx).id },
        });
      else {
        const data = input(sharedSchema, ctx.body);

        await ctx.db.sharedPicklist.create({
          data: { ...data, authorId: user(ctx).id },
        });
      }
      return label + " added";
    });
    router.add("PUT", path + "/:uuid", "verified", async (ctx) => {
      writable(ctx);
      const where = { uuid: ctx.params.uuid, ...scope(ctx) };
      if (mutable) {
        const data = input(
          mutableSchema.omit({ tournamentKey: true }),
          ctx.body,
        );
        await ctx.db.mutablePicklist.update({
          where,
          data: { ...data, authorId: user(ctx).id },
        });
      } else {
        const data = input(sharedSchema, ctx.body);
        await ctx.db.sharedPicklist.update({
          where,
          data: { ...data, authorId: user(ctx).id },
        });
      }
      return label + " updated";
    });
    router.add("DELETE", path + "/:uuid", "verified", async (ctx) => {
      writable(ctx);
      const where = { uuid: ctx.params.uuid, ...scope(ctx) };
      if (mutable) await ctx.db.mutablePicklist.delete({ where });
      else await ctx.db.sharedPicklist.delete({ where });
      return label + " deleted";
    });
  }
}
