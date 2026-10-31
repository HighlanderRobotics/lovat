import { createHash, randomBytes } from "node:crypto";
import db from "../../prismaClient.js";
import { TRAINING_POST_ROLL_SECONDS } from "./trainingTiming.js";
import { Prisma } from "@lovat/db";

export const token = (): string => randomBytes(32).toString("base64url");
export const hashToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export class TrainingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const sessionInclude = {
  trainingVideo: {
    include: { answerKeyReports: { include: { teamMatchData: true } } },
  },
  attempts: {
    include: {
      scouter: { select: { name: true, sourceTeamNumber: true } },
      report: {
        select: {
          status: true,
          finalizedReport: {
            select: {
              uuid: true,
              trainingScores: {
                orderBy: { gradedAt: "desc" as const },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TrainingSessionInclude;

export type SessionRecord = Prisma.TrainingSessionGetPayload<{
  include: typeof sessionInclude;
}>;
export type TrainingVideoDetails = {
  uuid: string;
  matchKey: string;
  videoLink: string;
  teamNumber: number;
  tournamentKey: string;
  matchType: string;
  matchNumber: number;
  alliance: string;
  startOffsetSeconds: number;
  durationSeconds: number;
  postMatchSeconds: number;
};
export type TrainingSnapshot = {
  uuid: string;
  status: string;
  serverTime: number;
  startedAt: number | null;
  endedAt: number | null;
  expiresAt: number;
  video: TrainingVideoDetails;
  participants: {
    uuid: string;
    name: string | null;
    teamNumber: number;
    deviceName: string;
    ready: boolean;
    connected: boolean;
    status: string;
    reportUuid: string | null;
    score: { overallScore: number; breakdown: Prisma.JsonValue } | null;
  }[];
};

export async function readSession(
  uuid: string,
  accessToken: string,
  attemptUuid?: string,
): Promise<SessionRecord> {
  const session = await db.trainingSession.findUnique({
    where: { uuid },
    include: sessionInclude,
  });
  if (
    !session ||
    !accessToken ||
    (attemptUuid
      ? !session.attempts.some(
          (a) =>
            a.uuid === attemptUuid &&
            a.accessTokenHash === hashToken(accessToken),
        )
      : session.browserTokenHash !== hashToken(accessToken))
  ) {
    throw new TrainingError(404, "Training session not found.");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new TrainingError(
      410,
      "Training session expired. Start a new session.",
    );
  }
  return session;
}

export function videoDetails(
  video: NonNullable<Awaited<ReturnType<typeof readSession>>["trainingVideo"]>,
): TrainingVideoDetails {
  const key = video.answerKeyReports[0];
  if (!key || video.answerKeyReports.length !== 1) {
    throw new TrainingError(
      409,
      "This video needs exactly one robot answer key.",
    );
  }
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
    postMatchSeconds: TRAINING_POST_ROLL_SECONDS,
  };
}

export async function snapshot(
  uuid: string,
  accessToken: string,
  attemptUuid?: string,
): Promise<TrainingSnapshot> {
  const session = await readSession(uuid, accessToken, attemptUuid);
  if (!session.trainingVideo) {
    throw new TrainingError(409, "Training video is unavailable.");
  }
  return {
    uuid: session.uuid,
    status: session.status,
    serverTime: Date.now(),
    startedAt: session.startedAt?.getTime() ?? null,
    endedAt: session.endedAt?.getTime() ?? null,
    expiresAt: session.expiresAt.getTime(),
    video: videoDetails(session.trainingVideo),
    participants: session.attempts
      .filter((a) => !attemptUuid || a.uuid === attemptUuid)
      .map((a) => ({
        uuid: a.uuid,
        name: a.scouter.name,
        teamNumber: a.scouter.sourceTeamNumber,
        deviceName: a.deviceName,
        ready: a.ready,
        connected: Date.now() - a.lastSeenAt.getTime() < 20_000,
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
