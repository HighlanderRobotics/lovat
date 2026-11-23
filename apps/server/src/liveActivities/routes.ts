import { Router, Request } from "express";
import z from "zod";
import db from "../prismaClient.js";
import { kv } from "../redisClient.js";
import { AppError } from "../lib/errors.js";
import { backgroundActivitiesReady } from "./apns.js";
import { scoutingActivityState } from "./schedule.js";
import {
  REGISTRATION_TTL_MS,
  readSubscription,
  saveSubscription,
  subscriptionInput,
  subscriptionKey,
} from "./subscriptions.js";

async function identity(req: Request) {
  const input = z
    .object({ code: z.string().min(1), scouterUuid: z.uuid() })
    .parse({
      code: req.headers["x-team-code"],
      scouterUuid: req.headers["x-scouter-uuid"],
    });
  const team = await db.registeredTeam.findUnique({
    where: { code: input.code },
  });

  if (!team) {
    throw new AppError("Team code is not correct.", 401, "UNAUTHORIZED");
  }

  const scout = await db.scouter.findFirst({
    where: {
      uuid: input.scouterUuid,
      sourceTeamNumber: team.number,
      archived: false,
    },
  });

  if (!scout) {
    throw new AppError("Scout not found on this team.", 404, "NOT_FOUND");
  }

  return { sourceTeamNumber: team.number, scouterUuid: scout.uuid };
}

export const liveActivityRoutes = Router();

liveActivityRoutes.get("/live-activities/:tournament", async (req, res) => {
  const owner = await identity(req);
  const tournament = z.string().min(1).max(100).parse(req.params.tournament);
  const state = await scoutingActivityState(
    owner.sourceTeamNumber,
    owner.scouterUuid,
    tournament,
  );
  res.json({ state, backgroundReady: backgroundActivitiesReady() });
});

liveActivityRoutes.post("/live-activities", async (req, res) => {
  const owner = await identity(req);
  const input = subscriptionInput.parse(req.body);
  const previous = await readSubscription(input.installationId);

  if (
    previous &&
    (previous.sourceTeamNumber !== owner.sourceTeamNumber ||
      previous.scouterUuid !== owner.scouterUuid)
  ) {
    throw new AppError(
      "This device registration belongs to a different scout.",
      409,
      "CONFLICT",
    );
  }

  const sameTournament = previous?.tournamentKey === input.tournamentKey;
  if (
    sameTournament &&
    input.kind === "update" &&
    input.activityId &&
    input.activityId === previous?.retiredActivityId
  ) {
    // A replaced activity's token would point updates at an ended activity.
    res.json({ backgroundReady: backgroundActivitiesReady() });
    return;
  }
  const sameActivity =
    sameTournament &&
    input.activityId !== undefined &&
    input.activityId === previous?.activityId;
  await saveSubscription({
    ...(sameTournament ? previous : {}),
    ...owner,
    installationId: input.installationId,
    tournamentKey: input.tournamentKey,
    environment: input.environment,
    mascotStyle: input.mascotStyle,
    expiresAt: Math.max(
      sameTournament ? (previous?.expiresAt ?? 0) : 0,
      Date.now() + REGISTRATION_TTL_MS,
    ),
    ...(input.kind === "start"
      ? { startToken: input.token }
      : {
          updateToken: input.token,
          activityId: input.activityId,
          // Token rotations keep the original start time for the 8-hour limit.
          activityStartedAt:
            (sameActivity && previous?.activityStartedAt) || Date.now(),
          startSentAt: undefined,
        }),
  });
  res.json({ backgroundReady: backgroundActivitiesReady() });
});

liveActivityRoutes.delete(
  "/live-activities/:installation",
  async (req, res) => {
    const owner = await identity(req);
    const installation = z.uuid().parse(req.params.installation);
    const record = await readSubscription(installation);

    if (
      record &&
      (record.sourceTeamNumber !== owner.sourceTeamNumber ||
        record.scouterUuid !== owner.scouterUuid)
    ) {
      throw new AppError("Device registration not found.", 404, "NOT_FOUND");
    }

    await kv.del(subscriptionKey(installation));
    res.sendStatus(204);
  },
);
