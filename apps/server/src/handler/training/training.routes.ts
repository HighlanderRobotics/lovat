import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { Prisma } from "@lovat/db";
import z from "zod";
import db from "../../prismaClient.js";
import {
  hashToken,
  token,
  readSession,
  snapshot,
  sessionInclude,
  videoDetails,
  TrainingError,
} from "./sessionService.js";
import { gradeTrainingReport } from "./gradeReport.js";
import { submitReport } from "../collection/submitReport.js";
import { trainingPlaybackEnd } from "./trainingTiming.js";
import { trainingValidationError } from "./validationError.js";

export const trainingRoutes = Router();
const access = (req: Request) =>
  req.headers.authorization?.replace(/^Bearer /, "") ?? "";
const id = (req: Request) => String(req.params.session);

trainingRoutes.get("/training/videos", async (_req, res) => {
  const rows = await db.trainingVideo.findMany({
    include: { answerKeyReports: { include: { teamMatchData: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    rows
      .filter(
        (row) =>
          row.answerKeyReports.length === 1 && row.answerKeyReports[0].training,
      )
      .map(videoDetails),
  );
});

trainingRoutes.post(
  "/training/sessions",
  rateLimit({ windowMs: 60_000, limit: 10 }),
  async (req, res) => {
    const { videoUuid } = z.object({ videoUuid: z.uuid() }).parse(req.body);
    const video = await db.trainingVideo.findUnique({
      where: { uuid: videoUuid },
      include: { answerKeyReports: { include: { teamMatchData: true } } },
    });
    if (
      !video ||
      video.answerKeyReports.length !== 1 ||
      !video.answerKeyReports[0].training
    ) {
      throw new TrainingError(404, "Training exercise is unavailable.");
    }
    const browserToken = token(),
      pairingToken = token();
    const session = await db.trainingSession.create({
      data: {
        trainingVideoUuid: videoUuid,
        targetTeamNumber: videoDetails(video).teamNumber,
        browserTokenHash: hashToken(browserToken),
        pairingTokenHash: hashToken(pairingToken),
        expiresAt: new Date(Date.now() + 6 * 60 * 60_000),
      },
    });
    res.status(201).json({ uuid: session.uuid, browserToken, pairingToken });
  },
);

trainingRoutes.post("/train/:session", async (req, res) => {
  const input = z
    .object({
      pairingToken: z.string().min(32).max(100),
      deviceName: z.string().trim().min(1).max(80),
      code: z.string().min(1),
      scouterUuid: z.uuid(),
      deviceId: z.string().min(1).max(200),
    })
    .parse({
      ...req.body,
      code: req.headers["x-team-code"],
      scouterUuid: req.headers["x-scouter-uuid"],
      deviceId: req.headers["x-device-id"],
    });
  const team = await db.registeredTeam.findUnique({
    where: { code: input.code },
  });
  const scout =
    team &&
    (await db.scouter.findFirst({
      where: {
        uuid: input.scouterUuid,
        sourceTeamNumber: team.number,
        archived: false,
      },
    }));
  if (!team || !scout) {
    throw new TrainingError(
      401,
      "Select a valid team and scout in Collection first.",
    );
  }
  const attemptToken = token();
  const attempt = await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT uuid FROM "TrainingSession" WHERE uuid = ${id(req)} FOR UPDATE`,
    );
    const session = await tx.trainingSession.findUnique({
      where: { uuid: id(req) },
    });
    if (
      !session ||
      session.pairingTokenHash !== hashToken(input.pairingToken)
    ) {
      throw new TrainingError(404, "Invalid training QR code.");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new TrainingError(410, "Training QR code expired.");
    }
    if (session.status !== "LOBBY") {
      throw new TrainingError(409, "This session has already started.");
    }
    if (
      session.sourceTeamNumber !== null &&
      session.sourceTeamNumber !== team.number
    ) {
      throw new TrainingError(403, "This session belongs to another team.");
    }
    await tx.trainingSession.update({
      where: { uuid: session.uuid },
      data: { sourceTeamNumber: team.number },
    });
    const existing = await tx.trainingAttempt.findFirst({
      where: {
        sessionUuid: session.uuid,
        scouterUuid: scout.uuid,
        deviceId: input.deviceId,
      },
    });
    const data = {
      accessTokenHash: hashToken(attemptToken),
      deviceName: input.deviceName,
      lastSeenAt: new Date(),
    };
    return existing
      ? tx.trainingAttempt.update({ where: { uuid: existing.uuid }, data })
      : tx.trainingAttempt.create({
          data: {
            ...data,
            sessionUuid: session.uuid,
            scouterUuid: scout.uuid,
            deviceId: input.deviceId,
          },
        });
  });
  res.json({
    attemptUuid: attempt.uuid,
    attemptToken,
    snapshot: await snapshot(id(req), attemptToken, attempt.uuid),
  });
});

trainingRoutes.get("/training/sessions/:session", async (req, res) => {
  const attempt =
    typeof req.query.attempt === "string" ? req.query.attempt : undefined;
  if (attempt) {
    await readSession(id(req), access(req), attempt);
    await db.trainingAttempt.updateMany({
      where: {
        uuid: attempt,
        sessionUuid: id(req),
        lastSeenAt: { lt: new Date(Date.now() - 5000) },
      },
      data: { lastSeenAt: new Date() },
    });
  }
  res.json(await snapshot(id(req), access(req), attempt));
});

trainingRoutes.post("/training/sessions/:session/ready", async (req, res) => {
  const { attemptUuid, stage } = z
    .object({
      attemptUuid: z.uuid(),
      stage: z.enum(["LOBBY", "ARMED"]).optional(),
    })
    .parse(req.body);
  await readSession(id(req), access(req), attemptUuid);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT uuid FROM "TrainingSession" WHERE uuid = ${id(req)} FOR UPDATE`,
    );
    const session = await tx.trainingSession.findUniqueOrThrow({
      where: { uuid: id(req) },
    });
    if (!["LOBBY", "ARMED"].includes(session.status)) {
      throw new TrainingError(409, "Session already started.");
    }
    if (stage !== undefined && stage !== session.status) {
      throw new TrainingError(
        409,
        "Training moved to the next step. Try again.",
      );
    }
    const draft = await tx.scoutReportInProgress.findUnique({
      where: { trainingAttemptUuid: attemptUuid },
    });
    if (
      !draft ||
      draft.status !== "LOADED" ||
      draft.teamNumber !== session.targetTeamNumber
    ) {
      throw new TrainingError(
        409,
        "Load the training robot before marking ready.",
      );
    }
    await tx.trainingAttempt.update({
      where: { uuid: attemptUuid },
      data: { ready: true, lastSeenAt: new Date() },
    });
  });
  res.json({ ready: true });
});

trainingRoutes.post("/training/sessions/:session/control", async (req, res) => {
  const { action, playbackSeconds } = z
    .object({
      action: z.enum(["arm", "play", "end", "interrupt"]),
      playbackSeconds: z.number().finite().min(0).max(600).optional(),
    })
    .parse(req.body);
  await readSession(id(req), access(req));
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT uuid FROM "TrainingSession" WHERE uuid = ${id(req)} FOR UPDATE`,
    );
    const session = await tx.trainingSession.findUniqueOrThrow({
      where: { uuid: id(req) },
      include: sessionInclude,
    });
    if (action === "arm") {
      if (session.status === "ARMED") {
        return;
      }
      if (
        session.status !== "LOBBY" ||
        session.attempts.length === 0 ||
        session.attempts.some(
          (a) => !a.ready || Date.now() - a.lastSeenAt.getTime() > 20_000,
        )
      ) {
        throw new TrainingError(
          409,
          "Every scout must be connected and ready before showing starting positions.",
        );
      }
      await tx.trainingSession.update({
        where: { uuid: session.uuid },
        data: { status: "ARMED" },
      });
      // Readiness now confirms the starting pose, independently of lobby readiness.
      await tx.trainingAttempt.updateMany({
        where: { sessionUuid: session.uuid },
        data: { ready: false },
      });
    } else if (action === "play") {
      if (session.status === "PLAYING") {
        return;
      }
      if (session.status !== "ARMED") {
        throw new TrainingError(409, "Start the session before playing.");
      }
      if (
        session.attempts.length === 0 ||
        session.attempts.some(
          (a) => !a.ready || Date.now() - a.lastSeenAt.getTime() > 20_000,
        )
      ) {
        throw new TrainingError(
          409,
          "Every scout must be connected and ready before playing.",
        );
      }
      await tx.trainingSession.update({
        where: { uuid: session.uuid },
        data: { status: "PLAYING", startedAt: new Date() },
      });
    } else if (action === "end") {
      if (session.status === "ENDED") {
        return;
      }
      if (
        session.status !== "PLAYING" ||
        !session.startedAt ||
        !session.trainingVideo
      ) {
        throw new TrainingError(409, "Video has not started.");
      }
      const endedAt = new Date(
        session.startedAt.getTime() +
          session.trainingVideo.durationSeconds * 1000,
      );
      if (
        Date.now() + 2000 <
        trainingPlaybackEnd(
          session.startedAt,
          session.trainingVideo.durationSeconds,
        )
      ) {
        throw new TrainingError(409, "Wait for the match video to finish.");
      }
      await tx.trainingSession.update({
        where: { uuid: session.uuid },
        data: { status: "ENDED", endedAt },
      });
    } else {
      if (["ENDED", "INTERRUPTED"].includes(session.status)) {
        return;
      }
      const matchEnd =
        session.startedAt && session.trainingVideo
          ? new Date(
              session.startedAt.getTime() +
                session.trainingVideo.durationSeconds * 1000,
            )
          : null;
      const completed =
        matchEnd !== null &&
        Date.now() >= matchEnd.getTime() &&
        playbackSeconds !== undefined &&
        playbackSeconds >= session.trainingVideo!.durationSeconds;
      await tx.trainingSession.update({
        where: { uuid: session.uuid },
        data: completed
          ? { status: "ENDED", endedAt: matchEnd }
          : { status: "INTERRUPTED" },
      });
    }
  });
  res.json(await snapshot(id(req), access(req)));
});

trainingRoutes.delete(
  "/training/sessions/:session/participants/:attempt",
  async (req, res) => {
    const session = await readSession(id(req), access(req));
    const changed = await db.trainingAttempt.deleteMany({
      where: {
        uuid: String(req.params.attempt),
        sessionUuid: session.uuid,
        session: { status: "LOBBY" },
      },
    });
    if (!changed.count) {
      throw new TrainingError(
        409,
        "Participant cannot be removed after the session starts.",
      );
    }
    res.sendStatus(204);
  },
);

trainingRoutes.post("/training/sessions/:session/grade", async (req, res) => {
  const session = await readSession(id(req), access(req));
  for (const attempt of session.attempts) {
    const uuid = attempt.report?.finalizedReport?.uuid;
    if (uuid) {
      await gradeTrainingReport(uuid);
    }
  }
  res.json(await snapshot(id(req), access(req)));
});

trainingRoutes.post("/training/:session/submit", async (req, res) => {
  const uuid = z.uuid().parse(req.body?.uuid);
  const draft = await db.scoutReportInProgress.findUnique({ where: { uuid } });
  if (
    !draft ||
    draft.mode !== "TRAINING" ||
    draft.trainingSessionUuid !== id(req)
  ) {
    throw new TrainingError(404, "Training report not found.");
  }
  const session = await db.trainingSession.findUnique({
    where: { uuid: id(req) },
  });
  if (session?.status !== "ENDED") {
    throw new TrainingError(
      409,
      "Wait for the video to finish before submitting.",
    );
  }
  await submitReport(req, res);
  if (res.statusCode === 200) {
    await gradeTrainingReport(uuid).catch((error) =>
      console.error("Training grading pending", error),
    );
  }
});

trainingRoutes.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TrainingError) {
      res.status(error.status).json({ displayError: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json(trainingValidationError(error));
      return;
    }
    console.error("Training request failed", error);
    res
      .status(500)
      .json({ displayError: "Could not update training. Try again." });
  },
);
