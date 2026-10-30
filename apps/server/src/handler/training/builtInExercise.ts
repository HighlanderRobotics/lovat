import { randomUUID } from "node:crypto";
import db from "../../prismaClient.js";
import rawReport from "./johnson118.report.json" with { type: "json" };
import { EventActionMap, PositionMap } from "../manager/managerConstants.js";

import { reportSchema } from "../collection/reportSchema.js";
const report = reportSchema.omit({ appVersion: true }).parse(rawReport);

export const BUILT_IN_TRAINING_VIDEO = "6580274b-cfe1-4c10-a043-e80a2ddf9162";

/** Keep the reviewed exercise available on every deployment without copying
 * accounts or enabling competition analysis for its answer key. */
export async function ensureBuiltInTrainingExercise(): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('training-exercise:2026joh_qm19:118',93))::text`;
    for (const [number, name] of [
      [118, "Robonauts"],
      [8033, "Highlander Robotics"],
    ] as const) {
      await tx.team.upsert({
        where: { number },
        create: { number, name },
        update: {},
      });
    }
    await tx.registeredTeam.upsert({
      where: { number: 8033 },
      create: {
        number: 8033,
        code: randomUUID(),
        email: "training-8033@example.invalid",
      },
      update: {},
    });
    const scouter = await tx.scouter.upsert({
      where: { uuid: report.scouterUuid },
      create: {
        uuid: report.scouterUuid,
        name: "Training answer key",
        sourceTeamNumber: 8033,
      },
      update: {},
    });
    if (scouter.sourceTeamNumber !== 8033) {
      throw new Error("Built-in exercise scout has a conflicting owner");
    }
    await tx.tournament.upsert({
      where: { key: "2026joh" },
      create: { key: "2026joh", name: "Johnson Division 2026" },
      update: {},
    });
    await tx.match.upsert({
      where: { key: "2026joh_qm19" },
      create: {
        key: "2026joh_qm19",
        tournamentKey: "2026joh",
        competitionLevel: "QUALIFICATION",
        matchNumber: 19,
        setNumber: 1,
      },
      update: {},
    });
    let slot = await tx.teamMatchData.findFirst({
      where: { matchKey: "2026joh_qm19", teamNumber: 118 },
    });
    if (!slot) {
      slot = await tx.teamMatchData.create({
        data: {
          key: "2026joh_qm19_118",
          matchKey: "2026joh_qm19",
          tournamentKey: "2026joh",
          matchType: "QUALIFICATION",
          matchNumber: 19,
          teamNumber: 118,
          alliance: "RED",
          station: 1,
        },
      });
    }
    if (slot.alliance !== "RED") {
      throw new Error("Built-in exercise robot has a conflicting alliance");
    }
    const {
      events,
      mobility,
      tournamentKey: _tournament,
      matchType: _type,
      matchNumber: _match,
      teamNumber: _team,
      startTime,
      ...fields
    } = report;
    void _tournament;
    void _type;
    void _match;
    void _team;
    const canonicalEvents = events.map(
      ([time, action, position, quantity]) => ({
        time,
        action: EventActionMap[action],
        position: PositionMap[position],
        quantity: typeof quantity === "number" ? quantity : 0,
        points: action === 1 && typeof quantity === "number" ? quantity : 0,
      }),
    );
    const key = await tx.scoutReport.upsert({
      where: { uuid: report.uuid },
      include: { events: true },
      update: {},
      create: {
        ...fields,
        fieldTraversal: mobility,
        startTime: new Date(startTime),
        teamMatchKey: slot.key,
        training: true,
        events: { create: canonicalEvents },
      },
    });
    const eventSignature = (rows: typeof canonicalEvents) =>
      JSON.stringify(
        rows
          .map(({ time, action, position, quantity, points }) => ({
            time,
            action,
            position,
            quantity,
            points,
          }))
          .sort((a, b) => a.time - b.time || a.action.localeCompare(b.action)),
      );
    if (
      !key.training ||
      key.teamMatchKey !== slot.key ||
      eventSignature(key.events) !== eventSignature(canonicalEvents)
    ) {
      throw new Error(
        "Built-in exercise answer key conflicts with an existing report",
      );
    }
    const video = await tx.trainingVideo.upsert({
      where: { uuid: BUILT_IN_TRAINING_VIDEO },
      update: { answerKeyReports: { connect: { uuid: report.uuid } } },
      create: {
        uuid: BUILT_IN_TRAINING_VIDEO,
        matchKey: "2026joh_qm19",
        videoLink: "https://www.youtube.com/watch?v=gmdPS6_RVJw",
        startOffsetSeconds: 7,
        durationSeconds: 163,
        alliance: "RED",
        excludedFields: ["feederTypes", "disrupts", "defenseEffectiveness"],
        answerKeyReports: { connect: { uuid: report.uuid } },
      },
      include: { answerKeyReports: { select: { uuid: true } } },
    });
    if (
      video.matchKey !== "2026joh_qm19" ||
      video.videoLink !== "https://www.youtube.com/watch?v=gmdPS6_RVJw" ||
      video.startOffsetSeconds !== 7 ||
      video.durationSeconds !== 163 ||
      video.answerKeyReports.length !== 1 ||
      video.answerKeyReports[0].uuid !== report.uuid
    ) {
      throw new Error(
        "Built-in training video conflicts with the reviewed exercise",
      );
    }
  });
}
