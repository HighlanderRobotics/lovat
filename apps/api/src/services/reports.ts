import { recordAnalysisChange, reportEffects } from "../domain/effects.js";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  reportSchema,
  loadReportSchema,
  startReportSchema,
  endReportSchema,
  type ReportSubmission,
} from "@lovat/api";
import type { Prisma } from "@lovat/db";
import {
  ServiceRouter,
  Reply,
  input,
  user,
  team,
  writable,
  notFound,
  type Context,
} from "../http/router.js";
import {
  normalizeTimeline,
  persistenceData,
  canonicalPayload,
} from "../domain/reports.js";
import { HttpError } from "../errors.js";

const ttl = () => new Date(Date.now() + 7 * 86400000);
const legacySubmission = reportSchema.extend({
  uuid: z.string().min(1),
  scouterUuid: z.string().min(1),
  events: reportSchema.shape.events.max(10000),
});
const rule = <S extends z.ZodType>(schema: S) =>
  z.object({ mode: z.enum(["INCLUDE", "EXCLUDE"]), items: z.array(schema) });
export function sourceFilter(ctx: Context): Prisma.ScoutReportWhereInput {
  const actor = user(ctx);
  const teams = rule(z.number()).safeParse(actor.teamSourceRule);
  const tournaments = rule(z.string()).safeParse(actor.tournamentSourceRule);
  if (!teams.success || !tournaments.success)
    throw new HttpError(
      503,
      "INVALID_ACCESS_SCOPE",
      "Access settings unavailable",
    );
  return {
    training: false,
    scouter: {
      sourceTeamNumber:
        teams.data.mode === "INCLUDE"
          ? { in: teams.data.items }
          : { notIn: teams.data.items },
    },
    teamMatchData: {
      tournamentKey:
        tournaments.data.mode === "INCLUDE"
          ? { in: tournaments.data.items }
          : { notIn: tournaments.data.items },
    },
  };
}
async function scout(ctx: Context, uuid?: string) {
  const id = uuid ?? input(z.string().min(1), ctx.headers["x-scouter-uuid"]);
  const sourceTeamNumber = ctx.collectionTeam ?? team(ctx);
  return (
    (await ctx.db.scouter.findFirst({
      where: { uuid: id, sourceTeamNumber, archived: false },
    })) ?? notFound("Scout not found on this team")
  );
}
async function ownedDraft(ctx: Context, uuid: string) {
  const actor = await scout(ctx);
  const row = await ctx.db.scoutReportInProgress.findFirst({
    where: {
      uuid,
      sourceTeamNumber: actor.sourceTeamNumber,
      scouterUuid: actor.uuid,
    },
    include: { trainingSession: { select: { expiresAt: true, status: true } } },
  });
  if (!row) notFound("Report not found");
  if (
    row.status !== "SUBMITTED" &&
    (row.status === "ABANDONED" ||
      row.expiresAt.getTime() <= Date.now() ||
      (row.mode === "TRAINING" &&
        (!row.trainingSession ||
          row.trainingSession.expiresAt.getTime() <= Date.now() ||
          row.trainingSession.status === "INTERRUPTED")))
  ) {
    throw new HttpError(
      410,
      "REPORT_EXPIRED",
      "Report or training session expired",
    );
  }
  return row;
}
async function slot(
  ctx: Context,
  report: Pick<
    ReportSubmission,
    "teamNumber" | "matchType" | "matchNumber" | "tournamentKey"
  >,
) {
  let row = await ctx.db.teamMatchData.findFirst({
    where: report,
    include: { tournament: { select: { seasonYear: true } } },
  });
  if (!row && report.matchType === "PRACTICE") {
    const key =
      report.tournamentKey +
      "_pm" +
      report.matchNumber +
      "_" +
      report.teamNumber;
    row = await ctx.db.teamMatchData.upsert({
      where: { key },
      create: { key, ...report },
      update: {},
      include: { tournament: { select: { seasonYear: true } } },
    });
  }
  return row ?? notFound("Match not found");
}
export function registerReports(router: ServiceRouter) {
  const load = async (ctx: Context) => {
    const data = input(loadReportSchema, ctx.body);
    const actor = await scout(ctx);
    const deviceId = input(
      z.string().min(1).max(200),
      ctx.headers["x-device-id"],
    );
    const teamNumber = input(
      z.coerce.number().int().positive(),
      ctx.params.team ?? data.teamNumber,
    );
    const matchKey =
      ctx.params.match ??
      (data.matchIdentity
        ? (
            await ctx.db.teamMatchData.findFirst({
              where: { ...data.matchIdentity, teamNumber },
              select: { matchKey: true },
            })
          )?.matchKey
        : null);
    if (!matchKey) notFound("Match not found");
    const match = await ctx.db.match.findUnique({
      where: { key: matchKey },
      include: {
        teamSlots: { where: { teamNumber } },
        tournament: { select: { seasonYear: true } },
      },
    });
    const selected = match?.teamSlots[0];
    if (!match || !selected) notFound("Team not in match");
    const existing = await ctx.db.scoutReportInProgress.findUnique({
      where: { uuid: data.uuid },
    });
    if (existing) {
      if (
        existing.sourceTeamNumber !== actor.sourceTeamNumber ||
        existing.scouterUuid !== actor.uuid
      )
        notFound();
      if (
        existing.teamNumber !== teamNumber ||
        existing.tournamentKey !== match.tournamentKey ||
        existing.matchType !== selected.matchType ||
        existing.matchNumber !== selected.matchNumber ||
        existing.trainingAttemptUuid !== (data.trainingAttemptUuid ?? null)
      ) {
        throw new HttpError(
          409,
          "REPORT_ID_CONFLICT",
          "Report UUID belongs to a different match or training attempt",
        );
      }
      await ownedDraft(ctx, existing.uuid);
      return { uuid: existing.uuid };
    }
    let trainingSessionUuid: string | null = null;
    if (data.trainingAttemptUuid) {
      const attempt = await ctx.db.trainingAttempt.findFirst({
        where: {
          uuid: data.trainingAttemptUuid,
          scouterUuid: actor.uuid,
          session: { sourceTeamNumber: actor.sourceTeamNumber },
        },
        include: { session: { include: { trainingVideo: true } } },
      });
      if (!attempt) notFound("Training attempt not found");
      if (
        attempt.submittedAt ||
        attempt.session.status === "INTERRUPTED" ||
        attempt.session.expiresAt.getTime() <= Date.now() ||
        attempt.session.trainingVideo?.matchKey !== matchKey ||
        (attempt.session.targetTeamNumber !== null &&
          attempt.session.targetTeamNumber !== teamNumber)
      ) {
        throw new HttpError(
          409,
          "TRAINING_ATTEMPT_CONFLICT",
          "Training attempt is expired, submitted or bound to a different match",
        );
      }
      trainingSessionUuid = attempt.sessionUuid;
    }
    const seasonYear =
      match.tournament.seasonYear ?? Number(match.tournamentKey.slice(0, 4));
    if (!Number.isInteger(seasonYear) || seasonYear < 1992)
      throw new HttpError(
        409,
        "SEASON_UNAVAILABLE",
        "Match season unavailable",
      );
    await ctx.db.scoutReportInProgress.create({
      data: {
        uuid: data.uuid,
        scouterUuid: actor.uuid,
        sourceTeamNumber: actor.sourceTeamNumber,
        deviceId,
        seasonYear,
        schemaVersion: 1,
        mode: trainingSessionUuid ? "TRAINING" : "COMPETITION",
        trainingSessionUuid,
        trainingAttemptUuid: data.trainingAttemptUuid,
        tournamentKey: match.tournamentKey,
        matchType: selected.matchType,
        matchNumber: selected.matchNumber,
        teamNumber,
        payload: {
          uuid: data.uuid,
          scouterUuid: actor.uuid,
          tournamentKey: match.tournamentKey,
          matchType: selected.matchType,
          matchNumber: selected.matchNumber,
          teamNumber,
          events: [],
        },
        expiresAt: ttl(),
      },
    });
    return new Reply({ uuid: data.uuid }, 201);
  };
  const transition = (ending: boolean) => async (ctx: Context) => {
    const data = input(ending ? endReportSchema : startReportSchema, ctx.body);
    const row = await ownedDraft(ctx, data.uuid);
    const time = "endTime" in data ? data.endTime : data.startTime;
    const previous = ending ? row.endedAt : row.startedAt;
    if (ending && (!row.startedAt || time < row.startedAt.getTime()))
      throw new HttpError(
        409,
        "REPORT_STATE_CONFLICT",
        "Report must start before ending",
      );
    if (previous) {
      if (previous.getTime() !== time)
        throw new HttpError(
          409,
          "REPORT_TIME_CONFLICT",
          "Report already has a different timestamp",
        );
      return { uuid: row.uuid };
    }
    const changed = await ctx.db.scoutReportInProgress.updateMany({
      where: {
        uuid: row.uuid,
        sourceTeamNumber: row.sourceTeamNumber,
        scouterUuid: row.scouterUuid,
        status: ending ? "STARTED" : "LOADED",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: ending ? "ENDED" : "STARTED",
        ...(ending
          ? { endedAt: new Date(time) }
          : { startedAt: new Date(time) }),
        revision: { increment: 1 },
        expiresAt: ttl(),
      },
    });
    if (!changed.count)
      throw new HttpError(
        409,
        "REPORT_STATE_CONFLICT",
        "Report changed; retry the same UUID",
      );
    return { uuid: row.uuid };
  };
  const submit = async (ctx: Context) => {
    let report = input(reportSchema, ctx.body);
    const draft = await ownedDraft(ctx, report.uuid);
    if (
      draft.scouterUuid !== report.scouterUuid ||
      draft.teamNumber !== report.teamNumber ||
      draft.tournamentKey !== report.tournamentKey ||
      draft.matchType !== report.matchType ||
      draft.matchNumber !== report.matchNumber ||
      draft.startedAt?.getTime() !== report.startTime
    ) {
      throw new HttpError(
        409,
        "REPORT_IDENTITY_CONFLICT",
        "Report identity does not match its draft",
      );
    }
    report = normalizeTimeline(
      report,
      draft.endedAt && draft.startedAt
        ? (draft.endedAt.getTime() - draft.startedAt.getTime()) / 1000
        : Infinity,
    );
    const payload = canonicalPayload(report);
    if (draft.status === "SUBMITTED") {
      if (!isDeepStrictEqual(draft.payload, payload))
        throw new HttpError(
          409,
          "REPORT_PAYLOAD_CONFLICT",
          "Report was submitted with different data",
        );
      return { uuid: draft.uuid };
    }
    if (draft.status !== "ENDED" || !draft.endedAt || draft.schemaVersion !== 1)
      throw new HttpError(
        409,
        "REPORT_NOT_ENDED",
        "End the report before submitting",
      );
    const match = await slot(ctx, {
      teamNumber: report.teamNumber,
      tournamentKey: report.tournamentKey,
      matchType: report.matchType,
      matchNumber: report.matchNumber,
    });
    const training = draft.mode === "TRAINING";
    await ctx.db.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.scoutReportInProgress.updateMany({
        where: {
          uuid: draft.uuid,
          status: "ENDED",
          expiresAt: { gt: now },
          ...(training
            ? {
                trainingSession: {
                  is: {
                    expiresAt: { gt: now },
                    status: { not: "INTERRUPTED" },
                  },
                },
              }
            : {}),
        },
        data: {
          status: "SUBMITTED",
          payload,
          submittedAt: now,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new HttpError(
          409,
          "REPORT_STATE_CONFLICT",
          "Report changed; retry the same UUID",
        );
      await tx.scoutReport.create({
        data: persistenceData(
          report,
          match.key,
          training,
          draft.trainingSessionUuid,
        ),
      });
      await tx.scoutReportInProgress.update({
        where: { uuid: draft.uuid },
        data: { finalizedReportUuid: report.uuid },
      });
      if (training)
        await tx.trainingAttempt.update({
          where: { uuid: draft.trainingAttemptUuid! },
          data: { submittedAt: now, payload },
        });
      else await reportEffects(tx, report, draft.sourceTeamNumber);
    });
    return { uuid: report.uuid };
  };
  const legacy = async (ctx: Context) => {
    if (ctx.session) writable(ctx);
    const report = normalizeTimeline(input(legacySubmission, ctx.body));
    const actor = await scout(ctx, report.scouterUuid);
    const match = await slot(ctx, {
      teamNumber: report.teamNumber,
      tournamentKey: report.tournamentKey,
      matchType: report.matchType,
      matchNumber: report.matchNumber,
    });
    await ctx.db.$transaction(async (tx) => {
      const receipt = await tx.scoutReportInProgress.findFirst({
        where: { uuid: report.uuid },
      });
      if (receipt) {
        if (
          receipt.sourceTeamNumber !== actor.sourceTeamNumber ||
          receipt.scouterUuid !== actor.uuid
        )
          notFound();
        if (!isDeepStrictEqual(receipt.payload, canonicalPayload(report)))
          throw new HttpError(
            409,
            "REPORT_PAYLOAD_CONFLICT",
            "UUID was submitted with different data",
          );
        return;
      }
      await tx.scoutReport.create({ data: persistenceData(report, match.key) });
      await tx.scoutReportInProgress.create({
        data: {
          uuid: report.uuid,
          sourceTeamNumber: actor.sourceTeamNumber,
          scouterUuid: actor.uuid,
          deviceId: String(ctx.headers["x-device-id"] ?? "legacy"),
          seasonYear:
            match.tournament.seasonYear ??
            Number(report.tournamentKey.slice(0, 4)),
          schemaVersion: 1,
          mode: "COMPETITION",
          status: "SUBMITTED",
          tournamentKey: report.tournamentKey,
          matchType: report.matchType,
          matchNumber: report.matchNumber,
          teamNumber: report.teamNumber,
          payload: canonicalPayload(report),
          startedAt: new Date(report.startTime),
          submittedAt: new Date(),
          expiresAt: ttl(),
          finalizedReportUuid: report.uuid,
        },
      });
      await reportEffects(tx, report, actor.sourceTeamNumber);
    });

    return "done adding data";
  };
  for (const prefix of ["/collection", "/v2/collection"]) {
    router.add("POST", prefix + "/load", "collection", load);
    router.add("POST", prefix + "/load/:match/:team", "collection", load);
    router.add("POST", prefix + "/start", "collection", transition(false));
    router.add("POST", prefix + "/end", "collection", transition(true));
    router.add("POST", prefix + "/submit", "collection", submit);
    router.add("POST", prefix + "/scoutreports", "collection", legacy);
  }
  router.add("POST", "/v1/manager/scoutreports", "verified", legacy);
  router.add("POST", "/v1/manager/dashboard/scoutreport", "verified", legacy);
  router.add(
    "GET",
    "/v1/manager/scoutreports/:uuid",
    "session",
    async (ctx) => {
      const row = await ctx.db.scoutReport.findFirst({
        where: { AND: [sourceFilter(ctx), { uuid: ctx.params.uuid }] },
        include: {
          events: { orderBy: { time: "asc" } },
          scouter: { select: { sourceTeamNumber: true, name: true } },
        },
      });
      if (!row) notFound();
      const { events, scouter, ...report } = row;
      const sameTeam = scouter.sourceTeamNumber === user(ctx).teamNumber;
      return {
        scoutReport: {
          ...report,
          scouterName: sameTeam ? scouter.name : undefined,
        },
        events,
        canModify: sameTeam && user(ctx).role === "SCOUTING_LEAD",
      };
    },
  );
  router.add(
    "DELETE",
    "/v1/manager/scoutreports/:uuid",
    "lead",
    async (ctx) => {
      await ctx.db.$transaction(async (tx) => {
        const row = await tx.scoutReport.delete({
          where: {
            uuid: ctx.params.uuid,
            scouter: { sourceTeamNumber: team(ctx) },
          },
          include: { teamMatchData: { select: { teamNumber: true } } },
        });
        if (!row.training)
          await recordAnalysisChange(tx, row.teamMatchData.teamNumber);
      });
      return "Data deleted successfully";
    },
  );
  router.add("PUT", "/v1/manager/notes/:uuid", "lead", async (ctx) => {
    const data = input(z.object({ note: z.string().max(50000) }), ctx.body);
    await ctx.db.scoutReport.update({
      where: {
        uuid: ctx.params.uuid,
        scouter: { sourceTeamNumber: team(ctx) },
      },
      data: { notes: data.note },
    });
    return "Note updated";
  });
  router.add(
    "POST",
    "/v1/manager/scoutreports/setflag/:report",
    "session",
    async (ctx) => {
      const flag = input(z.enum(["true", "false"]), ctx.query.flag) === "true";
      const visible = await ctx.db.scoutReport.findFirst({
        where: { AND: [sourceFilter(ctx), { uuid: ctx.params.report }] },
        select: { uuid: true, teamMatchData: { select: { teamNumber: true } } },
      });
      if (!visible) notFound();
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "uuid" FROM "ScoutReport" WHERE "uuid" = ${visible.uuid} FOR UPDATE`;
        const row = await tx.scoutReport.update({
          where: { uuid: visible.uuid },
          data: {
            flaggedBy: flag
              ? { connect: { id: user(ctx).id } }
              : { disconnect: { id: user(ctx).id } },
          },
          include: { _count: { select: { flaggedBy: true } } },
        });
        if (
          !["VERIFIED", "BAD_REPORT", "FLAGGED_SYSTEM"].includes(
            row.reliability,
          )
        ) {
          await tx.scoutReport.update({
            where: { uuid: row.uuid },
            data: {
              reliability: row._count.flaggedBy > 2 ? "FLAGGED" : "UNVERIFIED",
            },
          });
        }
        await recordAnalysisChange(tx, visible.teamMatchData.teamNumber);
        return { flagged: flag, flagCount: row._count.flaggedBy };
      });
    },
  );
}
