import type { Request, Response } from "express";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@lovat/db";
import db from "../../prismaClient.js";
import { ownedReport } from "./ownedReport.js";
import { reportSchema } from "./reportSchema.js";
import { EventActionMap, PositionMap } from "../manager/managerConstants.js";
import {
  checkForInvalidEvents,
  removeOrphanedStartEvents,
} from "./addScoutReport.js";
import { invalidateCache } from "../../lib/clearCache.js";
import { sendWarningToSlack } from "../slack/sendWarningNotification.js";

export const submitReport = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = reportSchema.safeParse(req.body);

  if (!input.success) {
    res.status(400).send({
      displayError: "Invalid scout report.",
      error: input.error.issues,
    });

    return;
  }

  try {
    const report = input.data;
    const draft = await ownedReport(req, res, report.uuid);

    if (!draft) {
      return;
    }

    if (
      report.scouterUuid !== draft.scouterUuid ||
      report.tournamentKey !== draft.tournamentKey ||
      report.matchType !== draft.matchType ||
      report.matchNumber !== draft.matchNumber ||
      report.teamNumber !== draft.teamNumber ||
      report.startTime !== draft.startedAt?.getTime()
    ) {
      res.status(409).send({
        displayError: "Report identity or start time does not match the draft.",
      });

      return;
    }

    report.events = removeOrphanedStartEvents(
      report.events as number[][],
      report.appVersion,
    ) as typeof report.events;

    if (draft.status === "SUBMITTED") {
      if (!isDeepStrictEqual(draft.payload, report)) {
        res.status(409).send({
          displayError: "Report was already submitted with different data.",
        });

        return;
      }

      res.json({ uuid: draft.uuid });

      return;
    }

    if (
      draft.status !== "ENDED" ||
      !draft.endedAt ||
      draft.schemaVersion !== 1
    ) {
      res.status(409).send({
        displayError:
          "Report must end before submission and use a supported schema.",
      });

      return;
    }

    const timelineError = checkForInvalidEvents(report.events as number[][]);
    const duration =
      (draft.endedAt.getTime() - draft.startedAt.getTime()) / 1000;
    const invalidTime = report.events.some(
      (event, index) =>
        event[0] > duration ||
        (index > 0 && event[0] < report.events[index - 1][0]),
    );

    if (timelineError || invalidTime) {
      res.status(400).send({
        displayError:
          timelineError?.join(" ") ??
          "Events must be ordered and within the match duration.",
      });

      return;
    }

    const match = await db.teamMatchData.findFirst({
      where: {
        tournamentKey: draft.tournamentKey,
        matchType: draft.matchType,
        matchNumber: draft.matchNumber,
        teamNumber: draft.teamNumber,
      },
    });

    if (!match) {
      res.status(404).send({ displayError: "Match not found." });

      return;
    }

    const training = draft.mode === "TRAINING";
    const submittedAt = new Date();

    // The final report, its events, and the draft state must commit together.
    const saved = await db.$transaction(async (tx) => {
      const claimed = await tx.scoutReportInProgress.updateMany({
        where: {
          uuid: draft.uuid,
          status: "ENDED",
          expiresAt: { gt: submittedAt },
          ...(training
            ? {
                trainingSession: {
                  is: {
                    expiresAt: { gt: submittedAt },
                    status: { not: "INTERRUPTED" },
                  },
                },
              }
            : {}),
        },
        data: {
          status: "SUBMITTED",
          submittedAt,
          payload: report as Prisma.InputJsonObject,
          revision: { increment: 1 },
        },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await tx.scoutReport.create({
        data: {
          uuid: report.uuid,
          scouterUuid: draft.scouterUuid,
          teamMatchKey: match.key,
          startTime: draft.startedAt,
          training,
          trainingSessionUuid: training ? draft.trainingSessionUuid : null,

          notes: report.notes,
          robotRoles: report.robotRoles,
          driverAbility: report.driverAbility,
          robotBrokeDescription: report.robotBrokeDescription ?? null,
          fieldTraversal: report.mobility,
          autoClimb: report.autoClimb,
          endgameClimb: report.endgameClimb,
          beached: report.beached,
          feederTypes: report.feederTypes,
          intakeType: report.intakeType,
          accuracy: report.accuracy ?? null,
          defenseEffectiveness: report.defenseEffectiveness,
          scoresWhileMoving: report.scoresWhileMoving,
          climbPosition: report.climbPosition,
          climbSide: report.climbSide,
          disrupts: report.disrupts,

          events: {
            create: (report.events as number[][]).map(
              ([time, action, position, quantity]) => ({
                time,
                action: EventActionMap[action],
                position: PositionMap[position],
                points:
                  EventActionMap[action] === "STOP_SCORING" ? quantity! : 0,
                quantity: ["STOP_SCORING", "STOP_FEEDING"].includes(
                  EventActionMap[action],
                )
                  ? quantity!
                  : 0,
              }),
            ),
          },
        },
      });

      await tx.scoutReportInProgress.update({
        where: { uuid: draft.uuid },
        data: { finalizedReportUuid: report.uuid },
      });

      if (training) {
        await tx.trainingAttempt.update({
          where: { uuid: draft.trainingAttemptUuid! },
          data: { submittedAt, payload: report as Prisma.InputJsonObject },
        });
      }

      return true;
    });

    if (!saved) {
      res.status(409).send({
        displayError:
          "Report changed during submission. Retry with the same UUID.",
      });

      return;
    }

    if (!training) {
      await invalidateCache(report.teamNumber, report.tournamentKey).catch(
        (error) => console.error("Failed to invalidate report cache", error),
      );

      if (report.robotBrokeDescription?.trim()) {
        void sendWarningToSlack(
          "BREAK",
          match.matchNumber,
          match.teamNumber,
          match.tournamentKey,
          report.uuid,
        ).catch((error) =>
          console.error("Failed to send robot break warning", error),
        );
      }
    }

    res.json({ uuid: report.uuid });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code)
    ) {
      res.status(409).send({
        displayError: "Report changed during submission. Refresh and retry.",
      });

      return;
    }

    console.error("Failed to submit match report", error);

    res.status(500).send({ displayError: "Could not submit match report." });
  }
};
