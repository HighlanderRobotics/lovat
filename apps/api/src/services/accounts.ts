import { createHash } from "node:crypto";
import { recordAnalysisChange, enqueue } from "../domain/effects.js";
import { z } from "zod";
import {
  ServiceRouter,
  Reply,
  input,
  team,
  user,
  writable,
  notFound,
} from "../http/router.js";
import { HttpError } from "../errors.js";

export function registerAccounts(router: ServiceRouter) {
  router.add("GET", "/v1/manager/profile", "session", async (ctx) =>
    ctx.db.user.findUnique({
      where: { id: user(ctx).id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        team: { select: { team: { select: { number: true, name: true } } } },
      },
    }),
  );
  router.add("GET", "/v1/manager/users", "verified", async (ctx) =>
    ctx.db.user.findMany({
      where: { teamNumber: team(ctx) },
      select: { teamNumber: true, username: true, email: true, id: true },
      take: 1000,
    }),
  );
  router.add("GET", "/v1/manager/analysts", "lead", async (ctx) =>
    ctx.db.user.findMany({
      where: { teamNumber: team(ctx), role: "ANALYST" },
      select: { id: true, username: true, email: true },
      take: 1000,
    }),
  );
  router.add("POST", "/v1/manager/upgradeuser", "lead", async (ctx) => {
    const data = input(z.object({ user: z.string().min(1) }), ctx.body);
    await ctx.db.user.update({
      where: { id: data.user, teamNumber: team(ctx) },
      data: { role: "SCOUTING_LEAD" },
    });
    return "user role updated to scouting lead";
  });
  router.add("POST", "/v1/manager/noteam", "jwt", async (ctx) => {
    return ctx.db.$transaction(async (tx) => {
      const actor = user(ctx);
      if (actor.teamNumber) {
        await tx.$queryRawUnsafe(
          'SELECT number FROM "RegisteredTeam" WHERE number = $1 FOR UPDATE',
          actor.teamNumber,
        );
        if (
          actor.role === "SCOUTING_LEAD" &&
          (await tx.user.count({
            where: { teamNumber: actor.teamNumber, role: "SCOUTING_LEAD" },
          })) <= 1
        )
          throw new HttpError(
            409,
            "LAST_SCOUTING_LEAD",
            "Assign another scouting lead before leaving",
          );
      }
      return tx.user.update({
        where: { id: actor.id },
        data: { teamNumber: null, role: "ANALYST" },
      });
    });
  });
  router.add("DELETE", "/v1/manager/user", "verified", async (ctx) => {
    writable(ctx);
    const actor = user(ctx);
    await ctx.db.$transaction(async (tx) => {
      // Serialize membership changes for this team so two leads cannot both delete the last lead.
      await tx.$queryRaw`SELECT "number" FROM "RegisteredTeam" WHERE "number" = ${team(ctx)} FOR UPDATE`;
      if (
        actor.role === "SCOUTING_LEAD" &&
        (await tx.user.count({
          where: { teamNumber: team(ctx), role: "SCOUTING_LEAD" },
        })) <= 1
      ) {
        throw new HttpError(
          409,
          "LAST_SCOUTING_LEAD",
          "Assign another scouting lead before deleting your account",
        );
      }
      await tx.user.delete({ where: { id: actor.id, teamNumber: team(ctx) } });
    });
    return "User deleted";
  });
  router.add("GET", "/v1/manager/code", "lead", async (ctx) => {
    const row = await ctx.db.registeredTeam.findUnique({
      where: { number: team(ctx) },
      select: { code: true, teamApproved: true },
    });
    if (!row) notFound();
    if (!row.teamApproved)
      throw new HttpError(
        403,
        "TEAM_NOT_APPROVED",
        "Team approval is required",
      );
    return row.code;
  });
  router.add("POST", "/v1/manager/onboarding/username", "jwt", async (ctx) => {
    const data = input(
      z.object({ username: z.string().trim().min(1).max(200) }),
      ctx.body,
    );
    await ctx.db.user.update({ where: { id: user(ctx).id }, data });
    return "Username added";
  });
  router.add(
    "POST",
    "/v1/manager/onboarding/teamwebsite",
    "jwt",
    async (ctx) => {
      if (user(ctx).role !== "SCOUTING_LEAD")
        throw new HttpError(
          403,
          "LEAD_REQUIRED",
          "A scouting lead is required",
        );
      const data = input(z.object({ website: z.url() }), ctx.body);
      await ctx.db.$transaction(async (tx) => {
        const row = await tx.registeredTeam.update({
          where: { number: team(ctx) },
          data,
        });
        const fingerprint = createHash("sha256")
          .update(row.email + " " + row.website)
          .digest("hex");
        await enqueue(tx, "registration:" + row.number + ":" + fingerprint, {
          kind: "slack.registration",
          teamNumber: row.number,
        });
      });
      return "Website added";
    },
  );
  router.add("POST", "/v1/manager/onboarding/teamcode", "jwt", async (ctx) => {
    const data = input(
      z.object({
        code: z.string().min(1).max(256),
        team: z.coerce.number().int().positive().optional(),
      }),
      Object.keys(ctx.query).length ? ctx.query : ctx.body,
    );
    const row = await ctx.db.registeredTeam.findUnique({
      where: { code: data.code },
      select: { number: true },
    });
    if (!row || (data.team !== undefined && row.number !== data.team))
      throw new HttpError(404, "INVALID_TEAM_CODE", "Team code does not exist");
    if (user(ctx).teamNumber && user(ctx).teamNumber !== row.number)
      throw new HttpError(
        409,
        "ALREADY_ON_TEAM",
        "Account already belongs to a team",
      );
    await ctx.db.user.update({
      where: { id: user(ctx).id },
      data: {
        teamNumber: row.number,
        teamSourceRule: { mode: "INCLUDE", items: [row.number] },
      },
    });
    return true;
  });
  router.add("POST", "/v1/manager/scouterdashboard", "lead", async (ctx) => {
    const data = input(
      z.object({ name: z.string().trim().min(1).max(200) }),
      ctx.body,
    );
    return new Reply(
      await ctx.db.scouter.create({
        data: { name: data.name, sourceTeamNumber: team(ctx) },
      }),
      201,
    );
  });
  router.add(
    "GET",
    "/v1/manager/scoutershift/scouters",
    "verified",
    async (ctx) => {
      const archived =
        ctx.query.archived === undefined
          ? undefined
          : ctx.query.archived === "true";
      return ctx.db.scouter.findMany({
        where: { sourceTeamNumber: team(ctx), archived },
        select: { uuid: true, name: true },
        orderBy: { name: "asc" },
        take: 10000,
      });
    },
  );
  for (const [path, archived] of [
    ["archive", true],
    ["unarchive", false],
  ] as const) {
    router.add(
      "POST",
      "/v1/manager/" + path + "/uuid/:uuid",
      "lead",
      async (ctx) => {
        await ctx.db.scouter.update({
          where: { uuid: ctx.params.uuid, sourceTeamNumber: team(ctx) },
          data: { archived },
        });
        return "done " + (archived ? "archiving" : "unarchiving") + " scouter";
      },
    );
  }
  router.add("PUT", "/v1/manager/scoutername", "lead", async (ctx) => {
    const data = input(
      z.object({
        scouterUuid: z.string().min(1),
        newName: z.string().trim().min(1).max(200),
      }),
      ctx.body,
    );
    await ctx.db.scouter.update({
      where: { uuid: data.scouterUuid, sourceTeamNumber: team(ctx) },
      data: { name: data.newName },
    });
    return "Scouter name updated";
  });
  router.add("DELETE", "/v1/manager/scouterdashboard", "lead", async (ctx) => {
    const data = input(z.object({ scouterUuid: z.string().min(1) }), ctx.body);
    await ctx.db.$transaction(async (tx) => {
      const affected = await tx.teamMatchData.findMany({
        where: {
          scoutReports: {
            some: {
              scouterUuid: data.scouterUuid,
              scouter: { sourceTeamNumber: team(ctx) },
              training: false,
            },
          },
        },
        distinct: ["teamNumber"],
        select: { teamNumber: true },
      });
      await tx.scouter.delete({
        where: { uuid: data.scouterUuid, sourceTeamNumber: team(ctx) },
      });
      for (const row of affected)
        await recordAnalysisChange(tx, row.teamNumber);
    });
    return "Scouter deleted";
  });
}
