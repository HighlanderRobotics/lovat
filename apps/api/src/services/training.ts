import {
  trainingSessionCreateSchema,
  trainingPairSchema,
  trainingReadySchema,
  trainingControlSchema,
} from "@lovat/api";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@lovat/db";
import {
  ServiceRouter,
  Reply,
  input,
  notFound,
  type Context,
} from "../http/router.js";
import { HttpError } from "../errors.js";
import { gradeReport } from "../domain/grading.js";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const conflict = (message: string): never => {
  throw new HttpError(409, "TRAINING_STATE_CONFLICT", message);
};
const videoInclude = {
  answerKeyReports: { include: { teamMatchData: true } },
} as const;
const include = {
  trainingVideo: { include: videoInclude },
  attempts: {
    include: {
      scouter: { select: { name: true, sourceTeamNumber: true } },
      report: {
        select: {
          status: true,
          finalizedReport: {
            select: {
              uuid: true,
              trainingScores: { orderBy: { gradedAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  },
} as const satisfies Prisma.TrainingSessionInclude;
type Video = Prisma.TrainingVideoGetPayload<{ include: typeof videoInclude }>;
export function videoDetails(video: Video) {
  const key = video.answerKeyReports[0];
  if (!key || video.answerKeyReports.length !== 1 || !key.training)
    conflict("Exercise needs exactly one training answer key");
  return {
    uuid: video.uuid,
    matchKey: video.matchKey,
    videoLink: video.videoLink,
    teamNumber: key.teamMatchData.teamNumber,
    tournamentKey: key.teamMatchData.tournamentKey,
    matchType: key.teamMatchData.matchType,
    matchNumber: key.teamMatchData.matchNumber,
    alliance: video.alliance,
    startOffsetSeconds: video.startOffsetSeconds,
    durationSeconds: video.durationSeconds,
    postMatchSeconds: 15,
  };
}
export async function readTraining(
  db: PrismaClient,
  id: string,
  access: string,
  attempt?: string,
) {
  const row = await db.trainingSession.findUnique({
    where: { uuid: id },
    include,
  });
  if (
    !row ||
    !access ||
    (attempt
      ? !row.attempts.some(
          (a) => a.uuid === attempt && a.accessTokenHash === hash(access),
        )
      : row.browserTokenHash !== hash(access))
  )
    notFound("Training session not found");
  if (row.expiresAt.getTime() <= Date.now())
    throw new HttpError(410, "TRAINING_EXPIRED", "Training session expired");
  return row;
}
export async function trainingSnapshot(
  db: PrismaClient,
  id: string,
  access: string,
  attempt?: string,
) {
  const row = await readTraining(db, id, access, attempt);
  return formatTraining(row, attempt);
}
export function formatTraining(
  row: Awaited<ReturnType<typeof readTraining>>,
  attempt?: string,
) {
  if (!row.trainingVideo) conflict("Training video unavailable");
  return {
    uuid: row.uuid,
    status: row.status,
    serverTime: Date.now(),
    startedAt: row.startedAt?.getTime() ?? null,
    endedAt: row.endedAt?.getTime() ?? null,
    expiresAt: row.expiresAt.getTime(),
    video: videoDetails(row.trainingVideo!),
    participants: row.attempts
      .filter((a) => !attempt || a.uuid === attempt)
      .map((a) => ({
        uuid: a.uuid,
        name: a.scouter.name,
        teamNumber: a.scouter.sourceTeamNumber,
        deviceName: a.deviceName,
        ready: a.ready,
        connected: Date.now() - a.lastSeenAt.getTime() < 20000,
        status: a.report?.status ?? "CONNECTING",
        reportUuid: a.report?.finalizedReport?.uuid ?? null,
        score: a.report?.finalizedReport?.trainingScores[0]
          ? {
              overallScore: Number(
                a.report.finalizedReport.trainingScores[0].overallScore,
              ),
              breakdown: a.report.finalizedReport.trainingScores[0].breakdown,
            }
          : null,
      })),
  };
}
const access = (ctx: Context) =>
  ctx.headers.authorization?.replace(/^Bearer /i, "") ?? "";
export function registerTraining(router: ServiceRouter) {
  // Collection submission uses the same lifecycle handler as competition reports.
  const submit = router.endpoints.find(
    (e) => e.path === "/collection/submit" && e.method === "POST",
  )!.handle;
  for (const prefix of ["/collection", "/v2/collection"]) {
    router.add("GET", prefix + "/training/videos", "public", async (ctx) =>
      (
        await ctx.db.trainingVideo.findMany({
          include: videoInclude,
          orderBy: { createdAt: "asc" },
          take: 500,
        })
      )
        .filter(
          (v) =>
            v.answerKeyReports.length === 1 && v.answerKeyReports[0].training,
        )
        .map(videoDetails),
    );
    router.add("POST", prefix + "/training/sessions", "public", async (ctx) => {
      const data = input(trainingSessionCreateSchema, ctx.body);
      const video =
        (await ctx.db.trainingVideo.findUnique({
          where: { uuid: data.videoUuid },
          include: videoInclude,
        })) ?? notFound("Training exercise unavailable");
      const details = videoDetails(video),
        browserToken = token(),
        pairingToken = token();
      const session = await ctx.db.trainingSession.create({
        data: {
          trainingVideoUuid: video.uuid,
          targetTeamNumber: details.teamNumber,
          browserTokenHash: hash(browserToken),
          pairingTokenHash: hash(pairingToken),
          expiresAt: new Date(Date.now() + 6 * 3600000),
        },
      });
      return new Reply({ uuid: session.uuid, browserToken, pairingToken }, 201);
    });
    router.add(
      "POST",
      prefix + "/train/:session",
      "collection",
      async (ctx) => {
        const data = input(trainingPairSchema, ctx.body);
        const scouterUuid = input(z.uuid(), ctx.headers["x-scouter-uuid"]),
          deviceId = input(
            z.string().min(1).max(200),
            ctx.headers["x-device-id"],
          );
        const scout =
          (await ctx.db.scouter.findFirst({
            where: {
              uuid: scouterUuid,
              sourceTeamNumber: ctx.collectionTeam,
              archived: false,
            },
          })) ?? notFound("Scout not found");
        const attemptToken = token();
        const attempt = await ctx.db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            'SELECT uuid FROM "TrainingSession" WHERE uuid = $1 FOR UPDATE',
            ctx.params.session,
          );
          const row = await tx.trainingSession.findUnique({
            where: { uuid: ctx.params.session },
          });
          if (!row || row.pairingTokenHash !== hash(data.pairingToken))
            notFound("Invalid training QR code");
          if (row.expiresAt.getTime() <= Date.now())
            throw new HttpError(
              410,
              "TRAINING_EXPIRED",
              "Training QR code expired",
            );
          if (row.status !== "LOBBY") conflict("Session has already started");
          if (
            row.sourceTeamNumber !== null &&
            row.sourceTeamNumber !== ctx.collectionTeam
          )
            throw new HttpError(
              403,
              "WRONG_TEAM",
              "Session belongs to another team",
            );
          if (
            (await tx.trainingAttempt.count({
              where: { sessionUuid: row.uuid },
            })) >= 100
          )
            conflict("Session is full");
          await tx.trainingSession.update({
            where: { uuid: row.uuid },
            data: { sourceTeamNumber: ctx.collectionTeam },
          });
          const existing = await tx.trainingAttempt.findFirst({
            where: { sessionUuid: row.uuid, scouterUuid, deviceId },
          });
          const values = {
            accessTokenHash: hash(attemptToken),
            deviceName: data.deviceName,
            lastSeenAt: new Date(),
          };
          return existing
            ? tx.trainingAttempt.update({
                where: { uuid: existing.uuid },
                data: values,
              })
            : tx.trainingAttempt.create({
                data: {
                  ...values,
                  sessionUuid: row.uuid,
                  scouterUuid: scout.uuid,
                  deviceId,
                },
              });
        });
        return {
          attemptUuid: attempt.uuid,
          attemptToken,
          snapshot: await trainingSnapshot(
            ctx.db,
            ctx.params.session,
            attemptToken,
            attempt.uuid,
          ),
        };
      },
    );
    router.add(
      "GET",
      prefix + "/training/sessions/:session",
      "public",
      async (ctx) => {
        const attempt = ctx.query.attempt;
        const row = await readTraining(
          ctx.db,
          ctx.params.session,
          access(ctx),
          attempt,
        );
        if (attempt)
          await ctx.db.trainingAttempt.updateMany({
            where: {
              uuid: attempt,
              sessionUuid: ctx.params.session,
              lastSeenAt: { lt: new Date(Date.now() - 5000) },
            },
            data: { lastSeenAt: new Date() },
          });
        return formatTraining(row, attempt);
      },
    );
    router.add(
      "POST",
      prefix + "/training/sessions/:session/ready",
      "public",
      async (ctx) => {
        const data = input(trainingReadySchema, ctx.body);
        await readTraining(
          ctx.db,
          ctx.params.session,
          access(ctx),
          data.attemptUuid,
        );
        await ctx.db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            'SELECT uuid FROM "TrainingSession" WHERE uuid = $1 FOR UPDATE',
            ctx.params.session,
          );
          const row = await tx.trainingSession.findUniqueOrThrow({
            where: { uuid: ctx.params.session },
          });
          if (
            !["LOBBY", "ARMED"].includes(row.status) ||
            (data.stage !== undefined && data.stage !== row.status)
          )
            conflict("Training moved to the next step");
          const draft = await tx.scoutReportInProgress.findUnique({
            where: { trainingAttemptUuid: data.attemptUuid },
          });
          if (
            !draft ||
            draft.status !== "LOADED" ||
            draft.teamNumber !== row.targetTeamNumber
          )
            conflict("Load the training robot before marking ready");
          await tx.trainingAttempt.update({
            where: { uuid: data.attemptUuid },
            data: { ready: true, lastSeenAt: new Date() },
          });
        });
        return { ready: true };
      },
    );
    router.add(
      "POST",
      prefix + "/training/sessions/:session/control",
      "public",
      async (ctx) => {
        const data = input(trainingControlSchema, ctx.body);
        await readTraining(ctx.db, ctx.params.session, access(ctx));
        await ctx.db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            'SELECT uuid FROM "TrainingSession" WHERE uuid = $1 FOR UPDATE',
            ctx.params.session,
          );
          const row = await tx.trainingSession.findUniqueOrThrow({
            where: { uuid: ctx.params.session },
            include,
          });
          if (row.expiresAt.getTime() <= Date.now())
            conflict("Training session expired");
          if (data.action === "arm" || data.action === "play") {
            const target = data.action === "arm" ? "ARMED" : "PLAYING",
              previous = data.action === "arm" ? "LOBBY" : "ARMED";
            if (row.status === target) return;
            if (
              row.status !== previous ||
              !row.attempts.length ||
              row.attempts.some(
                (a) => !a.ready || Date.now() - a.lastSeenAt.getTime() > 20000,
              )
            )
              conflict("Every scout must be connected and ready");
            await tx.trainingSession.update({
              where: { uuid: row.uuid },
              data: {
                status: target,
                ...(target === "PLAYING" ? { startedAt: new Date() } : {}),
              },
            });
            if (target === "ARMED")
              await tx.trainingAttempt.updateMany({
                where: { sessionUuid: row.uuid },
                data: { ready: false },
              });
          } else if (!["ENDED", "INTERRUPTED"].includes(row.status)) {
            const end =
              row.startedAt && row.trainingVideo
                ? new Date(
                    row.startedAt.getTime() +
                      row.trainingVideo.durationSeconds * 1000,
                  )
                : null;
            if (
              data.action === "end" &&
              (!end ||
                row.status !== "PLAYING" ||
                Date.now() + 2000 < end.getTime() + 15000)
            )
              conflict("Wait for the match video to finish");
            const completed =
              data.action === "end" ||
              (end &&
                Date.now() >= end.getTime() &&
                (data.playbackSeconds ?? 0) >=
                  (row.trainingVideo?.durationSeconds ?? Infinity));
            await tx.trainingSession.update({
              where: { uuid: row.uuid },
              data: completed
                ? { status: "ENDED", endedAt: end }
                : { status: "INTERRUPTED" },
            });
          }
        });
        return trainingSnapshot(ctx.db, ctx.params.session, access(ctx));
      },
    );
    router.add(
      "DELETE",
      prefix + "/training/sessions/:session/participants/:attempt",
      "public",
      async (ctx) => {
        await readTraining(ctx.db, ctx.params.session, access(ctx));
        await ctx.db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            'SELECT uuid FROM "TrainingSession" WHERE uuid = $1 FOR UPDATE',
            ctx.params.session,
          );
          const changed = await tx.trainingAttempt.deleteMany({
            where: {
              uuid: ctx.params.attempt,
              sessionUuid: ctx.params.session,
              session: { status: "LOBBY" },
            },
          });
          if (!changed.count)
            conflict("Participant cannot be removed after the session starts");
        });
        return new Reply(null, 204);
      },
    );
    router.add(
      "POST",
      prefix + "/training/sessions/:session/grade",
      "public",
      async (ctx) => {
        const session = await readTraining(
          ctx.db,
          ctx.params.session,
          access(ctx),
        );
        for (const attempt of session.attempts) {
          const uuid = attempt.report?.finalizedReport?.uuid;
          if (uuid) await gradeReport(ctx.db, uuid);
        }
        return trainingSnapshot(ctx.db, ctx.params.session, access(ctx));
      },
    );
    router.add(
      "POST",
      prefix + "/training/:session/submit",
      "collection",
      async (ctx) => {
        const uuid = input(z.uuid(), (ctx.body as { uuid?: unknown })?.uuid);
        const draft = await ctx.db.scoutReportInProgress.findUnique({
          where: { uuid },
          include: { trainingSession: true },
        });
        if (
          !draft ||
          draft.mode !== "TRAINING" ||
          draft.trainingSessionUuid !== ctx.params.session
        )
          notFound("Training report not found");
        if (draft.trainingSession?.status !== "ENDED")
          conflict("Wait for the video to finish");
        const result = await submit(ctx);
        await gradeReport(ctx.db, uuid);
        return result;
      },
    );
  }
}
