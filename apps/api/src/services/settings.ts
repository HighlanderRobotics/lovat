import { verificationEmail } from "../domain/email.js";
import { z } from "zod";
import { ServiceRouter, input, team, user, writable } from "../http/router.js";
import { HttpError } from "../errors.js";

const storedRule = <S extends z.ZodType>(schema: S) =>
  z.object({ mode: z.enum(["INCLUDE", "EXCLUDE"]), items: z.array(schema) });
export function registerSettings(router: ServiceRouter, website: string) {
  router.add("PUT", "/v1/manager/settings", "session", async (ctx) => {
    writable(ctx);
    const data = input(
      z.object({
        teamSource: z.array(z.number().int().positive()).max(10000),
        tournamentSource: z.array(z.string()).max(5000),
      }),
      ctx.body,
    );
    await ctx.db.user.update({
      where: { id: user(ctx).id },
      data: {
        teamSourceRule: {
          mode: "INCLUDE",
          items: [...new Set(data.teamSource)],
        },
        tournamentSourceRule: {
          mode: "INCLUDE",
          items: [...new Set(data.tournamentSource)],
        },
      },
    });
    return "Settings successfully updated";
  });
  router.add(
    "GET",
    "/v1/manager/settings/teamsource",
    "session",
    async (ctx) => {
      const rule = input(storedRule(z.number()), user(ctx).teamSourceRule);
      if (rule.mode === "EXCLUDE" && !rule.items.length) return "ALL_TEAMS";
      if (
        rule.mode === "INCLUDE" &&
        rule.items.length === 1 &&
        rule.items[0] === user(ctx).teamNumber
      )
        return "THIS_TEAM";
      const teams = await ctx.db.team.findMany({
        where: {
          number:
            rule.mode === "INCLUDE"
              ? { in: rule.items }
              : { notIn: rule.items },
        },
        select: { number: true, name: true },
        take: 10000,
      });
      return teams.map((row) => row.number);
    },
  );
  router.add(
    "POST",
    "/v1/manager/settings/teamsource",
    "session",
    async (ctx) => {
      writable(ctx);
      const data = input(
        z.object({
          mode: z.string().optional(),
          teams: z.array(z.number().int().positive()).max(10000).default([]),
        }),
        ctx.body,
      );
      const rule =
        data.mode === "ALL_TEAMS"
          ? { mode: "EXCLUDE", items: [] }
          : {
              mode: "INCLUDE",
              items:
                data.mode === "THIS_TEAM"
                  ? [team(ctx)]
                  : [...new Set(data.teams)],
            };
      await ctx.db.user.update({
        where: { id: user(ctx).id },
        data: { teamSourceRule: rule },
      });
      return "team sources added";
    },
  );
  router.add(
    "GET",
    "/v1/manager/settings/tournamentsource",
    "session",
    async (ctx) => {
      const rule = input(
        storedRule(z.string()),
        user(ctx).tournamentSourceRule,
      );
      const rows = await ctx.db.tournament.findMany({
        select: { key: true },
        where: {
          key:
            rule.mode === "INCLUDE"
              ? { in: rule.items }
              : { notIn: rule.items },
        },
        orderBy: { date: "asc" },
        take: 5000,
      });
      return rows.map((row) => row.key);
    },
  );
  router.add(
    "POST",
    "/v1/manager/settings/tournamentsource",
    "session",
    async (ctx) => {
      writable(ctx);
      const data = input(
        z.object({ tournaments: z.array(z.string()).max(5000) }),
        ctx.body,
      );
      await ctx.db.user.update({
        where: { id: user(ctx).id },
        data: {
          tournamentSourceRule: {
            mode: "INCLUDE",
            items: [...new Set(data.tournaments)],
          },
        },
      });
      return "tournament sources added";
    },
  );
  router.add("GET", "/v1/manager/settings/teamemail", "lead", async (ctx) => {
    const row = await ctx.db.registeredTeam.findUnique({
      where: { number: team(ctx) },
      select: { email: true },
    });
    return row?.email ?? null;
  });
  router.add("PUT", "/v1/manager/settings/teamemail", "lead", async (ctx) => {
    writable(ctx);
    if (user(ctx).role !== "SCOUTING_LEAD")
      throw new HttpError(
        403,
        "SCOUTING_LEAD_REQUIRED",
        "A scouting lead is required",
      );
    const data = input(z.object({ email: z.email() }), ctx.body);
    await ctx.db.$transaction(async (tx) => {
      await tx.registeredTeam.update({
        where: { number: team(ctx) },
        data: { email: data.email, emailVerified: false },
      });
      await verificationEmail(tx, data.email, team(ctx), website);
    });
    return "Team email updated; verification required";
  });
}
