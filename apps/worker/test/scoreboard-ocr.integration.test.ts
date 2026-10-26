import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import {
  scanScoreboardTournament,
  analyzeScoreboardTournament,
} from "../src/jobs/scoreboard-ocr";
const enabled = process.env.LOVAT_DB_TEST === "1";
const eventKey = `ocr-${crypto.randomUUID()}`,
  matchKey = `${eventKey}_qm19`;
const sourceTeam = -Math.floor(Math.random() * 1000000) - 1;
let db: PrismaClient;
const oldTemplate = process.env.OCR_SCOREBOARD_TEMPLATE;
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  );
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test"
  )
    throw Error("Use disposable local lovat_test only");
  const { createDb } = await import("@lovat/db");
  db = createDb(url.href);
  await db.season.upsert({
    where: { year: 2026 },
    create: { year: 2026 },
    update: {},
  });
  for (const number of [8033, 118, 334, 10396, 4451, 7563, 9072, sourceTeam])
    await db.team.upsert({
      where: { number },
      update: {},
      create: { number, name: "Synthetic OCR test" },
    });
  await db.registeredTeam.create({
    data: {
      number: sourceTeam,
      code: crypto.randomUUID(),
      email: `${sourceTeam}@example.invalid`,
    },
  });
  const scout = await db.scouter.create({
    data: { sourceTeamNumber: sourceTeam },
  });
  await db.tournament.create({
    data: {
      key: eventKey,
      name: "Synthetic OCR tournament",
      seasonYear: 2026,
      teams: { create: { teamNumber: 8033 } },
    },
  });
  await db.match.create({
    data: {
      key: matchKey,
      tournamentKey: eventKey,
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 19,
      status: "COMPLETED",
      actualTime: new Date(Date.now() - 30 * 60000),
    },
  });
  for (const [index, number] of [118, 334, 10396, 4451, 7563, 9072].entries())
    await db.teamMatchData.create({
      data: {
        key: `${matchKey}_${index}`,
        matchKey,
        tournamentKey: eventKey,
        teamNumber: number,
        matchType: "QUALIFICATION",
        matchNumber: 19,
        alliance: index < 3 ? "RED" : "BLUE",
        station: (index % 3) + 1,
      },
    });
  await db.scoutReport.create({
    data: {
      teamMatchKey: `${matchKey}_0`,
      scouterUuid: scout.uuid,
      startTime: new Date(),
      notes: "Synthetic",
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
      events: {
        create: [
          { time: 30, action: "START_SCORING", position: "NONE", points: 0 },
          {
            time: 40,
            action: "STOP_SCORING",
            position: "NONE",
            points: 60,
            quantity: 60,
          },
        ],
      },
    },
  });
  process.env.OCR_SCOREBOARD_TEMPLATE = JSON.stringify({
    version: "test",
    season: 2026,
    redFuel: [0, 0, 0.1, 0.1],
    blueFuel: [0, 0, 0.1, 0.1],
    clock: [0, 0, 0.1, 0.1],
    identity: [0, 0, 1, 1],
  });
});
afterAll(async () => {
  if (oldTemplate === undefined) delete process.env.OCR_SCOREBOARD_TEMPLATE;
  else process.env.OCR_SCOREBOARD_TEMPLATE = oldTemplate;
  if (!enabled) return;
  await db.tournament.delete({ where: { key: eventKey } });
  await db.team.delete({ where: { number: sourceTeam } });
  await db.$disconnect();
});
test.skipIf(!enabled)(
  "validates a fallback video, stores only numeric evidence, and preserves lead restoration across repeated review",
  async () => {
    const observations = Array.from({ length: 164 }, (_, time) => ({
      time,
      red: time,
      blue: time * 2,
      confidence: 95,
    }));
    const attempts: string[] = [];
    await scanScoreboardTournament(eventKey, {
      db,
      tba: {
        get: async () => ({
          modified: true,
          data: {
            videos: [
              { type: "youtube", key: "aaaaaaaaaaa" },
              { type: "youtube", key: "bbbbbbbbbbb" },
            ],
          },
          etag: null,
          lastModified: null,
        }),
      } as any,
      extract: async (key) => {
        attempts.push(key);
        if (key === "aaaaaaaaaaa") throw Error("robot-only camera");
        return observations;
      },
    });
    expect(attempts).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(
      await db.scoreboardOcr.findUnique({ where: { matchKey } }),
    ).toMatchObject({
      status: "VALIDATED",
      videoKey: "bbbbbbbbbbb",
      observations,
    });
    await analyzeScoreboardTournament(eventKey, db);
    const flag = await db.reportValidationFlag.findFirstOrThrow({
      where: { evidenceMatchKey: matchKey },
    });
    expect(flag.status).toBe("REVIEW");
    expect(
      await db.event.findUnique({ where: { eventUuid: flag.eventUuid! } }),
    ).toMatchObject({ analysisExcluded: false, quantity: 60 });
    await db.reportValidationFlag.update({
      where: { uuid: flag.uuid },
      data: {
        status: "RESTORED",
        reviewedAt: new Date(),
        reviewedBy: "synthetic-lead",
      },
    });
    await analyzeScoreboardTournament(
      eventKey,
      db,
      new Date(Date.now() + 16 * 60000),
    );
    expect(
      await db.reportValidationFlag.count({
        where: { evidenceMatchKey: matchKey },
      }),
    ).toBe(1);
    expect(
      await db.reportValidationFlag.findUnique({ where: { uuid: flag.uuid } }),
    ).toMatchObject({ status: "RESTORED", reviewedBy: "synthetic-lead" });
    expect(
      await db.event.count({ where: { scoutReportUuid: flag.reportUuid } }),
    ).toBe(2);
  },
);
