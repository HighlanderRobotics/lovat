import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  ServiceRouter,
  input,
  user,
  team,
  positive,
  notFound,
} from "../http/router.js";
import { verificationEmail } from "../domain/email.js";
import { enqueue, recordAnalysisChange } from "../domain/effects.js";
import { HttpError } from "../errors.js";
export function registerOnboarding(router: ServiceRouter, website: string) {
  router.add("POST", "/v1/manager/onboarding/team", "jwt", async (ctx) => {
    const data = input(
      z.object({ number: positive, email: z.email() }),
      ctx.body,
    );
    if (user(ctx).teamNumber)
      throw new HttpError(
        409,
        "ALREADY_ON_TEAM",
        "Leave your current team before registering another",
      );
    await ctx.db.$transaction(async (tx) => {
      const toggle = await tx.featureToggle.findUnique({
        where: { feature: "fullRegistration" },
      });
      await tx.registeredTeam.create({
        data: {
          number: data.number,
          email: data.email,
          code: randomBytes(6).toString("hex").toUpperCase(),
          teamApproved: toggle?.enabled === false,
        },
      });
      await tx.user.update({
        where: { id: user(ctx).id },
        data: {
          teamNumber: data.number,
          role: "SCOUTING_LEAD",
          teamSourceRule: { mode: "INCLUDE", items: [data.number] },
        },
      });
      await verificationEmail(tx, data.email, data.number, website);
    });
    return "verification email sent";
  });
  router.add(
    "POST",
    "/v1/manager/onboarding/resendverificationemail",
    "jwt",
    async (ctx) => {
      const number = team(ctx);
      if (user(ctx).role !== "SCOUTING_LEAD")
        throw new HttpError(
          403,
          "LEAD_REQUIRED",
          "A scouting lead is required",
        );
      const row =
        (await ctx.db.registeredTeam.findUnique({ where: { number } })) ??
        notFound();
      await ctx.db.$transaction((tx) =>
        verificationEmail(tx, row.email, number, website),
      );
      return "verification email sent";
    },
  );
  router.add(
    "POST",
    "/v1/manager/onboarding/verifyemail",
    "signed",
    async (ctx) => {
      const data = input(
        z.object({ code: z.string().min(1).max(128) }),
        ctx.body,
      );
      await ctx.db.$transaction(async (tx) => {
        const row =
          (await tx.emailVerificationRequest.findUnique({
            where: { verificationCode: data.code.toLowerCase() },
          })) ?? notFound("CODE_NOT_RECOGNIZED");
        if (row.expiresAt.getTime() <= Date.now())
          throw new HttpError(400, "CODE_EXPIRED", "Verification code expired");
        const changed = await tx.registeredTeam.updateMany({
          where: { number: row.teamNumber, email: row.email },
          data: { emailVerified: true },
        });
        if (!changed.count)
          throw new HttpError(
            409,
            "EMAIL_CHANGED",
            "Request verification for your current email",
          );
        await tx.emailVerificationRequest.deleteMany({
          where: { teamNumber: row.teamNumber },
        });
      });
      return "Team email successfully verified";
    },
  );
  router.add(
    "GET",
    "/v1/manager/registeredteams/:team/registrationstatus",
    "session",
    async (ctx) => {
      const number = input(positive, ctx.params.team);
      const [row, toggle] = await Promise.all([
        ctx.db.registeredTeam.findUnique({ where: { number } }),
        ctx.db.featureToggle.findUnique({
          where: { feature: "fullRegistration" },
        }),
      ]);
      if (!row) return { status: "NOT_STARTED" };
      const owner =
        user(ctx).teamNumber === number && user(ctx).role === "SCOUTING_LEAD";
      if (row.emailVerified && row.teamApproved)
        return {
          status:
            user(ctx).teamNumber === number
              ? "REGISTERED_ON_TEAM"
              : "REGISTERED_OFF_TEAM",
        };
      if (!owner) return { status: "PENDING" };
      if (!row.emailVerified)
        return { status: "PENDING_EMAIL_VERIFICATION", email: row.email };
      if (toggle?.enabled !== false && !row.website)
        return { status: "PENDING_WEBSITE" };
      return { status: "PENDING_TEAM_VERIFICATION", teamEmail: row.email };
    },
  );
  router.add(
    "POST",
    "/v1/manager/registeredteams/:team/approve",
    "signed",
    async (ctx) => {
      const number = input(positive, ctx.params.team);
      await ctx.db.registeredTeam.update({
        where: { number },
        data: { teamApproved: true },
      });
      return { number, teamApproved: true };
    },
  );
  router.add(
    "POST",
    "/v1/manager/registeredteams/:team/reject",
    "signed",
    async (ctx) => {
      const number = input(positive, ctx.params.team);
      await ctx.db.$transaction(async (tx) => {
        const affected = await tx.teamMatchData.findMany({
          where: {
            scoutReports: { some: { scouter: { sourceTeamNumber: number } } },
          },
          distinct: ["teamNumber"],
          select: { teamNumber: true },
        });
        await tx.user.updateMany({
          where: { teamNumber: number },
          data: { teamNumber: null, role: "ANALYST" },
        });
        await tx.registeredTeam.delete({ where: { number } });
        for (const team of affected)
          await recordAnalysisChange(tx, team.teamNumber);
      });
      return "Team removed";
    },
  );
  router.add("POST", "/v1/manager/emailTeamCode", "public", async (ctx) => {
    const number = input(positive, ctx.query.teamNumber);

    const row =
      (await ctx.db.registeredTeam.findUnique({ where: { number } })) ??
      notFound();
    const window = Math.floor(Date.now() / 120000);
    await ctx.db.$transaction((tx) =>
      enqueue(tx, "team-code:" + number + ":" + window, {
        kind: "email.send",
        to: row.email,
        subject: "Lovat Team Code",
        text: "Your Lovat team code is: " + row.code,
      }),
    );
    const [local, domain] = row.email.split("@");
    return { email: local.slice(0, 1) + "***@" + domain };
  });
}
