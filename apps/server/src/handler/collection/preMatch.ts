import { Request, Response } from "express";
import { Prisma } from "@lovat/db";
import z from "zod";
import db from "../../prismaClient.js";
import { FRC_FIRST_YEAR } from "../../lib/frcConstants.js";

const identitySchema = z.object({
  tournamentKey: z.string().min(1),
  matchType: z.enum(["QUALIFICATION", "ELIMINATION"]),
  matchNumber: z.number().int().positive(),
});

const requestSchema = z
  .object({
    code: z.string().min(1),
    deviceId: z.string().min(1).max(200),
    scouterUuid: z.uuid(),
    uuid: z.uuid(),
    matchKey: z.string().min(1).optional(),
    identity: identitySchema.optional(),
    team: z.coerce.number().int().positive(),
    trainingAttemptUuid: z.uuid().optional(),
  })
  .refine((input) => Boolean(input.matchKey || input.identity));

export const preMatch = async (req: Request, res: Response): Promise<void> => {
  const params = requestSchema.safeParse({
    code: req.headers["x-team-code"],
    deviceId: req.headers["x-device-id"],
    scouterUuid: req.headers["x-scouter-uuid"],
    uuid: req.body?.uuid,
    trainingAttemptUuid: req.body?.trainingAttemptUuid,
    matchKey: req.params.match,
    team: req.params.team ?? req.body?.teamNumber,
    identity: req.body?.matchIdentity,
  });

  if (!params.success) {
    res.status(400).send({
      displayError: "Invalid input. Make sure you are using the correct input.",
      error: z.prettifyError(params.error),
    });

    return;
  }

  try {
    const input = params.data;

    const sourceTeam = await db.registeredTeam.findUnique({
      where: { code: input.code },
    });

    if (!sourceTeam) {
      res.status(401).send({ displayError: "Team code is not correct." });

      return;
    }

    const scouter = await db.scouter.findFirst({
      where: {
        uuid: input.scouterUuid,
        sourceTeamNumber: sourceTeam.number,
        archived: false,
      },
    });

    if (!scouter) {
      res.status(404).send({ displayError: "Scout not found on this team." });

      return;
    }

    const existing = await db.scoutReportInProgress.findUnique({
      where: { uuid: input.uuid },
    });

    if (
      existing &&
      (existing.sourceTeamNumber !== sourceTeam.number ||
        existing.scouterUuid !== input.scouterUuid)
    ) {
      res.status(404).send({ displayError: "Report not found." });

      return;
    }

    // Collection stores playoff ordinal numbers, so resolve the canonical key
    // from the imported team slot rather than constructing a TBA match key.
    const selectedSlot = input.matchKey
      ? null
      : await db.teamMatchData.findFirst({
          where: { ...input.identity, teamNumber: input.team },
          select: { matchKey: true },
        });

    const matchKey = input.matchKey ?? selectedSlot?.matchKey;

    if (!matchKey) {
      res.status(404).send({ displayError: "Match not found." });

      return;
    }

    const match = await db.match.findUnique({
      where: { key: matchKey },
      include: {
        teamSlots: true,
        tournament: { select: { seasonYear: true } },
      },
    });

    if (!match) {
      res.status(404).send({ displayError: "Match not found." });

      return;
    }

    const slot = match.teamSlots.find((slot) => slot.teamNumber === input.team);

    if (!slot) {
      res.status(404).send({ displayError: "Team not in match." });

      return;
    }

    if (existing) {
      if (
        existing.tournamentKey !== match.tournamentKey ||
        existing.matchType !== slot.matchType ||
        existing.matchNumber !== slot.matchNumber ||
        existing.teamNumber !== slot.teamNumber ||
        existing.trainingAttemptUuid !== (input.trainingAttemptUuid ?? null)
      ) {
        res.status(409).send({
          displayError:
            "Report UUID belongs to a different match or training attempt.",
        });

        return;
      }

      if (
        existing.status !== "SUBMITTED" &&
        (existing.status === "ABANDONED" ||
          existing.expiresAt.getTime() <= Date.now())
      ) {
        res
          .status(410)
          .send({ displayError: "Report expired. Start a new report." });

        return;
      }

      res.status(200).json({ uuid: existing.uuid });

      return;
    }

    const seasonYear =
      match.tournament.seasonYear ??
      Number(match.tournamentKey.match(/^(\d{4})/)?.[1]);

    if (!Number.isInteger(seasonYear) || seasonYear < FRC_FIRST_YEAR) {
      res.status(409).send({ displayError: "Match season is not available." });

      return;
    }

    let trainingSessionUuid: string | null = null;

    if (input.trainingAttemptUuid) {
      const attempt = await db.trainingAttempt.findFirst({
        where: {
          uuid: input.trainingAttemptUuid,
          scouterUuid: input.scouterUuid,
          session: { sourceTeamNumber: sourceTeam.number },
        },
        include: {
          session: {
            include: { trainingVideo: { select: { matchKey: true } } },
          },
        },
      });

      if (!attempt) {
        res.status(404).send({ displayError: "Training attempt not found." });

        return;
      }

      if (
        attempt.session.expiresAt.getTime() <= Date.now() ||
        attempt.session.status === "INTERRUPTED"
      ) {
        res.status(410).send({ displayError: "Training session expired." });

        return;
      }

      if (
        attempt.submittedAt ||
        attempt.session.trainingVideo?.matchKey !== match.key ||
        (attempt.session.targetTeamNumber !== null &&
          attempt.session.targetTeamNumber !== undefined &&
          attempt.session.targetTeamNumber !== input.team)
      ) {
        res.status(409).send({
          displayError:
            "Training attempt is already submitted or has a different match.",
        });

        return;
      }

      trainingSessionUuid = attempt.sessionUuid;
    }

    const payload = {
      uuid: input.uuid,
      tournamentKey: match.tournamentKey,
      matchType: slot.matchType,
      matchNumber: slot.matchNumber,
      teamNumber: slot.teamNumber,
      scouterUuid: input.scouterUuid,
      events: [],
    };

    const report = await db.scoutReportInProgress.create({
      data: {
        uuid: input.uuid,
        sourceTeamNumber: sourceTeam.number,
        scouterUuid: input.scouterUuid,
        deviceId: input.deviceId,

        tournamentKey: match.tournamentKey,
        matchType: slot.matchType,
        matchNumber: slot.matchNumber,
        teamNumber: slot.teamNumber,
        seasonYear,
        schemaVersion: 1,

        mode: trainingSessionUuid ? "TRAINING" : "COMPETITION",
        trainingSessionUuid,
        trainingAttemptUuid: input.trainingAttemptUuid,
        payload,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    res.status(201).json({ uuid: report.uuid });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).send({
        displayError:
          "Report or training attempt already has a draft. Retry with the same UUID.",
      });

      return;
    }

    console.error("Failed to prepare match report", error);

    res.status(500).send({ displayError: "Could not prepare match report." });
  }
};
