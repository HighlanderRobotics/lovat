import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error("Use LOVAT_DB_TEST=1 and a local lovat_test database");
}
const { db } = await import("../dist/index.js");

test("training videos connect answer keys and sessions to completed and in-progress reports", async () => {
  const id = randomUUID();
  const team = -Math.floor(Math.random() * 1_000_000_000) - 1;
  const tournament = `training-${id}`;
  const matchKey = `${tournament}-qm1`;
  const teamMatchKey = `${matchKey}-${team}`;
  const scout = randomUUID();
  const session = randomUUID();
  const video = randomUUID();
  const attempt = randomUUID();
  const reportData = (uuid) => ({
    uuid,
    teamMatchKey,
    scouterUuid: scout,
    startTime: new Date("2026-01-01T00:00:00Z"),
    notes: "Synthetic training fixture",
    robotRoles: ["SCORING"],
    driverAbility: 3,
    autoClimb: "NOT_ATTEMPTED",
    beached: "NEITHER",
    defenseEffectiveness: 0,
    feederTypes: [],
    intakeType: "NEITHER",
    fieldTraversal: "NONE",
    scoresWhileMoving: false,
    disrupts: false,
    endgameClimb: "NOT_ATTEMPTED",
  });
  try {
    await db.team.create({
      data: { number: team, name: "Training database test" },
    });
    await db.registeredTeam.create({
      data: { number: team, code: id, email: `${id}@example.invalid` },
    });
    await db.scouter.create({ data: { uuid: scout, sourceTeamNumber: team } });
    await db.tournament.create({
      data: { key: tournament, name: "Training database test" },
    });
    await db.match.create({
      data: {
        key: matchKey,
        tournamentKey: tournament,
        competitionLevel: "QUALIFICATION",
        setNumber: 1,
        matchNumber: 1,
      },
    });
    await db.teamMatchData.create({
      data: {
        key: teamMatchKey,
        tournamentKey: tournament,
        matchKey,
        matchType: "QUALIFICATION",
        matchNumber: 1,
        teamNumber: team,
      },
    });
    const ordinary = await db.scoutReport.create({
      data: reportData(randomUUID()),
    });
    assert.equal(ordinary.training, false);
    assert.equal(ordinary.trainingSessionUuid, null);
    const answer1 = await db.scoutReport.create({
      data: { ...reportData(randomUUID()), training: true },
    });
    const answer2 = await db.scoutReport.create({
      data: { ...reportData(randomUUID()), training: true },
    });
    await db.trainingVideo.create({
      data: {
        uuid: video,
        matchKey,
        videoLink: "https://example.invalid/match-video",
        answerKeyReports: {
          connect: [{ uuid: answer1.uuid }, { uuid: answer2.uuid }],
        },
      },
    });
    await db.trainingSession.create({
      data: {
        uuid: session,
        sourceTeamNumber: team,
        trainingVideoUuid: video,
        pairingTokenHash: id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await db.trainingAttempt.create({
      data: { uuid: attempt, sessionUuid: session, scouterUuid: scout },
    });
    await assert.rejects(
      db.scoutReport.create({
        data: { ...reportData(randomUUID()), trainingSessionUuid: session },
      }),
    );
    const completed = await db.scoutReport.create({
      data: {
        ...reportData(randomUUID()),
        training: true,
        trainingSessionUuid: session,
      },
    });
    await db.scoutReportInProgress.create({
      data: {
        uuid: completed.uuid,
        sourceTeamNumber: team,
        scouterUuid: scout,
        deviceId: id,
        seasonYear: 2026,
        schemaVersion: 1,
        mode: "TRAINING",
        status: "SUBMITTED",
        tournamentKey: tournament,
        matchType: "QUALIFICATION",
        matchNumber: 1,
        teamNumber: team,
        trainingSessionUuid: session,
        trainingAttemptUuid: attempt,
        payload: {},
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:02:30Z"),
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        finalizedReportUuid: completed.uuid,
      },
    });
    const saved = await db.trainingSession.findUniqueOrThrow({
      where: { uuid: session },
      include: {
        completedReports: true,
        reportsInProgress: true,
        trainingVideo: { include: { match: true, answerKeyReports: true } },
      },
    });
    assert.equal(saved.completedReports[0].uuid, completed.uuid);
    assert.equal(
      saved.reportsInProgress[0].finalizedReportUuid,
      completed.uuid,
    );
    assert.equal(saved.trainingVideo.match.key, matchKey);
    assert.equal(saved.trainingVideo.answerKeyReports.length, 2);
    assert.equal(
      (
        await db.scoutReport.findUniqueOrThrow({
          where: { uuid: answer1.uuid },
          include: { answerKeyForVideos: true },
        })
      ).answerKeyForVideos[0].uuid,
      video,
    );
    const scoreData = {
      reportUuid: completed.uuid,
      answerKeyReportUuid: answer1.uuid,
      rubricVersion: "2026-v1",
      overallScore: "92.50",
      breakdown: { counts: { score: 95 }, timing: { score: 90 } },
      answerKeySnapshot: {
        uuid: answer1.uuid,
        notes: answer1.notes,
        events: [],
      },
      submittedReportSnapshot: {
        uuid: completed.uuid,
        notes: completed.notes,
        events: [],
      },
    };
    const score = await db.trainingScore.create({ data: scoreData });
    assert.equal(score.overallScore.toString(), "92.5");
    await db.trainingScore.create({
      data: { ...scoreData, rubricVersion: "2026-v2", overallScore: "96.00" },
    });
    assert.equal(
      await db.trainingScore.count({ where: { reportUuid: completed.uuid } }),
      2,
    );
    assert.equal(
      (
        await db.scoutReport.findUniqueOrThrow({
          where: { uuid: completed.uuid },
          include: { trainingScores: true },
        })
      ).trainingScores.length,
      2,
    );
    for (const invalid of ["-1", "100.01", "NaN"]) {
      await assert.rejects(
        db.trainingScore.create({
          data: { ...scoreData, overallScore: invalid },
        }),
      );
    }
    await assert.rejects(
      db.trainingScore.create({ data: { ...scoreData, rubricVersion: " " } }),
    );
    await assert.rejects(
      db.trainingScore.create({
        data: { ...scoreData, answerKeySnapshot: [] },
      }),
    );
    await db.scoutReport.update({
      where: { uuid: answer1.uuid },
      data: { notes: "Edited answer" },
    });
    await db.scoutReport.delete({ where: { uuid: answer1.uuid } });
    const historicScore = await db.trainingScore.findUniqueOrThrow({
      where: { uuid: score.uuid },
    });
    assert.equal(historicScore.answerKeyReportUuid, null);
    assert.deepEqual(
      historicScore.answerKeySnapshot,
      scoreData.answerKeySnapshot,
    );
    assert.deepEqual(
      historicScore.submittedReportSnapshot,
      scoreData.submittedReportSnapshot,
    );

    // Video selection is nullable so sessions can exist before choosing a video.
    await db.trainingVideo.delete({ where: { uuid: video } });
    assert.equal(
      (await db.trainingSession.findUniqueOrThrow({ where: { uuid: session } }))
        .trainingVideoUuid,
      null,
    );
    await db.trainingSession.delete({ where: { uuid: session } });
    const retained = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: completed.uuid },
    });
    assert.equal(retained.training, true);
    assert.equal(retained.trainingSessionUuid, null);
    await db.scoutReport.delete({ where: { uuid: completed.uuid } });
    assert.equal(
      await db.trainingScore.count({ where: { reportUuid: completed.uuid } }),
      0,
    );
  } finally {
    await db.trainingSession.deleteMany({ where: { sourceTeamNumber: team } });
    await db.trainingVideo.deleteMany({ where: { matchKey } });
    await db.tournament.deleteMany({ where: { key: tournament } });
    await db.team.deleteMany({ where: { number: team } });
    await db.$disconnect();
  }
});
