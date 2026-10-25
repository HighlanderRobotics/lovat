import type { Request, Response } from "express";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@lovat/db";
import db from "../../prismaClient.js";
import { ownedReport } from "../collection/ownedReport.js";
import {
  chargedUpReportSchema,
  canRecordEvent,
  activeActivity,
  type ChargedUpEvent,
} from "./chargedUpReport.js";
import {
  chargedUpAnswer,
  compareChargedUpReports,
} from "./chargedUpGrading.js";
import { TrainingError } from "./sessionService.js";

export async function submitChargedUp(
  req: Request,
  res: Response,
): Promise<void> {
  const input = chargedUpReportSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      displayError: "Invalid Charged Up training report.",
      error: input.error.issues,
    });
    return;
  }
  const report = input.data;
  const draft = await ownedReport(req, res, report.uuid);
  if (!draft) {
    return;
  }
  if (
    draft.mode !== "TRAINING" ||
    draft.seasonYear !== 2023 ||
    !draft.trainingAttemptUuid ||
    draft.trainingSessionUuid !== String(req.params.session) ||
    report.scouterUuid !== draft.scouterUuid ||
    report.teamNumber !== draft.teamNumber ||
    report.tournamentKey !== draft.tournamentKey ||
    report.matchType !== draft.matchType ||
    report.matchNumber !== draft.matchNumber ||
    report.startTime !== draft.startedAt?.getTime()
  ) {
    throw new TrainingError(
      409,
      "Training report identity does not match its draft.",
    );
  }
  if (draft.status === "SUBMITTED") {
    if (!isDeepStrictEqual(draft.payload, report)) {
      throw new TrainingError(
        409,
        "Report was already submitted with different data.",
      );
    }
    res.json({ uuid: draft.uuid });
    return;
  }
  if (draft.status !== "ENDED" || !draft.endedAt || draft.schemaVersion !== 1) {
    throw new TrainingError(409, "End the training match before submitting.");
  }
  const session = await db.trainingSession.findUnique({
    where: { uuid: draft.trainingSessionUuid },
    include: { trainingVideo: true },
  });
  const answer = chargedUpAnswer(session?.trainingVideo?.chargedUpAnswerKey);
  if (
    !session ||
    session.status !== "ENDED" ||
    !answer ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    throw new TrainingError(
      409,
      "This Charged Up exercise is unavailable or has not finished.",
    );
  }
  const duration = (draft.endedAt.getTime() - draft.startedAt.getTime()) / 1000;
  const first = report.events[0];
  if (
    first?.action !== "START_POSITION" ||
    first.location !== "START_POSITION" ||
    first.time !== 0
  ) {
    throw new TrainingError(
      400,
      "Record one starting position at the start of the match.",
    );
  }
  const recorded: ChargedUpEvent[] = [];
  for (const event of report.events.slice(1)) {
    if (
      event.time > duration + 0.5 ||
      event.time < (recorded.at(-1)?.time ?? 0) ||
      !canRecordEvent(recorded, report.preloadedPiece ?? null, event)
    ) {
      throw new TrainingError(
        400,
        "The training timeline has an invalid action, piece, grid location, or time.",
      );
    }
    recorded.push(event);
  }
  if (activeActivity(recorded)) {
    throw new TrainingError(
      400,
      "Finish the active defence hold before submitting.",
    );
  }
  const result = compareChargedUpReports(
    report,
    answer,
    Array.isArray(session.trainingVideo.excludedFields)
      ? (session.trainingVideo.excludedFields as string[])
      : [],
  );
  const submittedAt = new Date();
  // 2023 training stays in the training JSON records. It never fabricates 2026
  // ScoutReport columns or enters competitive analysis and notifications.
  const saved = await db.$transaction(async (tx) => {
    const changed = await tx.scoutReportInProgress.updateMany({
      where: {
        uuid: draft.uuid,
        revision: draft.revision,
        status: "ENDED",
        expiresAt: { gt: submittedAt },
        trainingSession: {
          is: { status: "ENDED", expiresAt: { gt: submittedAt } },
        },
      },
      data: {
        status: "SUBMITTED",
        submittedAt,
        payload: report as Prisma.InputJsonObject,
        revision: { increment: 1 },
      },
    });
    if (!changed.count) {
      return false;
    }
    await tx.trainingAttempt.update({
      where: { uuid: draft.trainingAttemptUuid },
      data: {
        submittedAt,
        payload: report as Prisma.InputJsonObject,
        score: JSON.parse(
          JSON.stringify({
            ...result,
            rubricVersion: "charged-up-v1",
            gradedAt: submittedAt.toISOString(),
            answerKeySnapshot: answer,
            submittedReportSnapshot: report,
          }),
        ),
      },
    });
    return true;
  });
  if (!saved) {
    throw new TrainingError(
      409,
      "Report changed during submission. Retry with the same UUID.",
    );
  }
  res.json({ uuid: draft.uuid });
}
