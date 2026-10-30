import { beforeAll, afterAll, test, expect } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import {
  refreshMatchEstimates,
  storeBatchEstimateEvidence,
} from "../src/ocr/estimate-store";
import { fuseMatch } from "../src/ocr/fusion";
import { buildEstimateArchive } from "../src/ocr/estimate-archive";
import { fixture } from "./fixtures/official-fusion";
const enabled = process.env.LOVAT_DB_TEST === "1";
const id = crypto.randomUUID().replaceAll("-", ""),
  eventKey = `2026est${id}`,
  matchKey = `${eventKey}_qm1`;
const source = 100000 + Math.floor(Math.random() * 1000000);
const movedSource = source + 3000000;
let db: PrismaClient, reportUuid: string, eventUuid: string;
const f = fixture();
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
  for (const s of f.slots)
    await db.team.upsert({
      where: { number: s.teamNumber },
      create: { number: s.teamNumber, name: "Synthetic estimate team" },
      update: {},
    });
  for (const number of [source, movedSource]) {
    await db.team.create({
      data: { number, name: "Synthetic estimate source" },
    });
    await db.registeredTeam.create({
      data: {
        number,
        code: `${id}-${number}`,
        email: `${id}-${number}@example.invalid`,
      },
    });
  }
  const scout = await db.scouter.create({ data: { sourceTeamNumber: source } });
  await db.tournament.create({
    data: { key: eventKey, name: "Synthetic estimate test" },
  });
  await db.match.create({
    data: {
      key: matchKey,
      tournamentKey: eventKey,
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 1,
    },
  });
  for (const color of ["RED", "BLUE"] as const)
    await db.matchAlliance.create({
      data: {
        matchKey,
        color,
        score: f.tba.alliances[color === "RED" ? "red" : "blue"].score,
        scoreBreakdown: f.tba.score_breakdown[color === "RED" ? "red" : "blue"],
      },
    });
  for (const s of f.slots)
    await db.teamMatchData.create({
      data: {
        key: `${matchKey}_${s.teamNumber}`,
        matchKey,
        tournamentKey: eventKey,
        teamNumber: s.teamNumber,
        alliance: s.alliance as "RED" | "BLUE",
        station: s.station,
        matchType: "QUALIFICATION",
        matchNumber: 1,
      },
    });
  for (const r of f.reports) {
    const row = await db.scoutReport.create({
      data: {
        teamMatchKey: `${matchKey}_${r.teamNumber}`,
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
          create: r.events.map((e) => ({
            time: e.time,
            action: e.action as "START_SCORING" | "STOP_SCORING",
            quantity: e.quantity,
            position: "NONE",
            points: 0,
          })),
        },
      },
      include: { events: true },
    });
    if (r.teamNumber === 1) {
      reportUuid = row.uuid;
      eventUuid = row.events[0]!.eventUuid;
    }
  }
  await db.scoreboardOcr.create({
    data: {
      matchKey,
      videoKey: "synthetic",
      templateVersion: "synthetic",
      status: "PARTIAL",
      observations: f.ocr.observations,
      analyzeAfter: new Date(0),
    },
  });
});
afterAll(async () => {
  if (!enabled) return;
  await db.tournament.deleteMany({ where: { key: eventKey } });
  await db.scouter.deleteMany({
    where: { sourceTeamNumber: { in: [source, movedSource] } },
  });
  await db.registeredTeam.deleteMany({
    where: { number: { in: [source, movedSource] } },
  });
  await db.team.deleteMany({
    where: { number: { in: [source, movedSource] } },
  });
  await db.$disconnect();
});
const run = enabled ? test : test.skip;
run(
  "persists six deterministic phase scores without assigning alliance fouls",
  async () => {
    expect(await refreshMatchEstimates(db, matchKey)).toBe(6);
    const rows = await db.estimatedScore.findMany({ where: { matchKey } });
    expect(rows.reduce((s, r) => s + r.totalPoints, 0)).toBe(
      fuseMatch(f, [8033])
        .alliances.flatMap((a) => a.teams)
        .reduce((s, r) => s + r.estimatedPoints, 0),
    );
    expect(rows.find((r) => r.teamNumber === 1)?.autoPoints).toBe(4);
    expect(
      rows.every(
        (r) => r.sourceTeams.length === 1 && r.sourceTeams[0] === source,
      ),
    ).toBe(true);
    const hashes = rows.map((r) => r.inputSha256);
    await refreshMatchEstimates(db, matchKey);
    expect(
      (await db.estimatedScore.findMany({ where: { matchKey } })).map(
        (r) => r.inputSha256,
      ),
    ).toEqual(hashes);
  },
);
run(
  "unchanged official imports and unrelated roster metadata preserve estimates",
  async () => {
    await db.matchAlliance.update({
      where: { matchKey_color: { matchKey, color: "RED" } },
      data: { score: 15, scoreBreakdown: f.tba.score_breakdown.red },
    });
    await db.teamMatchData.update({
      where: { key: `${matchKey}_1` },
      data: {
        station: f.slots.find((s) => s.teamNumber === 1)!.station,
        disqualified: false,
      },
    });
    await db.scoreboardOcr.update({
      where: { matchKey },
      data: { observations: f.ocr.observations, processedAt: new Date() },
    });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(6);
  },
);
run(
  "event edits and lead exclusions invalidate derived rows and queue refresh",
  async () => {
    await db.scoreboardOcr.update({
      where: { matchKey },
      data: { analyzedAt: new Date() },
    });
    await db.event.update({ where: { eventUuid }, data: { quantity: 1 } });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(0);
    expect(
      (await db.scoreboardOcr.findUniqueOrThrow({ where: { matchKey } }))
        .analyzedAt,
    ).toBeNull();
    await refreshMatchEstimates(db, matchKey);
    await db.scoutReport.update({
      where: { uuid: reportUuid },
      data: { analysisExcluded: true },
    });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(0);
    await refreshMatchEstimates(db, matchKey);
    expect(
      (
        await db.estimatedScore.findFirstOrThrow({
          where: { matchKey, teamNumber: 1 },
        })
      ).reportCount,
    ).toBe(0);
  },
);
run(
  "scouter source changes invalidate estimates before another source can read them",
  async () => {
    await refreshMatchEstimates(db, matchKey);
    const scout = await db.scouter.findFirstOrThrow({
      where: { sourceTeamNumber: source },
    });
    await db.scouter.update({
      where: { uuid: scout.uuid },
      data: { sourceTeamNumber: movedSource },
    });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(0);
    await refreshMatchEstimates(db, matchKey);
    expect(
      (await db.estimatedScore.findMany({ where: { matchKey } })).every(
        (r) => r.sourceTeams.length === 1 && r.sourceTeams[0] === movedSource,
      ),
    ).toBe(true);
  },
);
run(
  "incomplete official inputs and rejected OCR cannot leave usable stale scores",
  async () => {
    await db.matchAlliance.update({
      where: { matchKey_color: { matchKey, color: "RED" } },
      data: { score: 999 },
    });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(0);
    expect(await refreshMatchEstimates(db, matchKey)).toBe(0);
    await db.matchAlliance.update({
      where: { matchKey_color: { matchKey, color: "RED" } },
      data: { score: 15 },
    });
    await refreshMatchEstimates(db, matchKey);
    await db.scoreboardOcr.update({
      where: { matchKey },
      data: { status: "REJECTED" },
    });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(0);
    expect(await refreshMatchEstimates(db, matchKey)).toBe(0);
  },
);

run(
  "batch resumes retain independent channels and refresh without duplicate score rows",
  async () => {
    const channels = {
      red: f.ocr.observations.map((o) => ({
        time: o.time,
        count: o.red,
        confidence: 95,
      })),
      blue: f.ocr.observations.map((o) => ({
        time: o.time,
        count: o.blue,
        confidence: 95,
      })),
    };
    const evidence = {
      ...f.ocr,
      matchKey,
      videoKey: "synthetic-video",
      templateVersion: "synthetic-v1",
      channels,
    };
    await expect(storeBatchEstimateEvidence(db, evidence, [])).rejects.toThrow(
      "Invalid estimate source scope",
    );
    expect(
      (await db.scoreboardOcr.findUniqueOrThrow({ where: { matchKey } }))
        .status,
    ).toBe("REJECTED");
    expect(await storeBatchEstimateEvidence(db, evidence, [movedSource])).toBe(
      6,
    );
    expect(
      (await db.scoreboardOcr.findUniqueOrThrow({ where: { matchKey } }))
        .channels,
    ).toEqual(channels);
    const before = await db.estimatedScore.findMany({
      where: { matchKey },
      orderBy: { teamNumber: "asc" },
    });
    expect(await storeBatchEstimateEvidence(db, evidence, [movedSource])).toBe(
      6,
    );
    const after = await db.estimatedScore.findMany({
      where: { matchKey },
      orderBy: { teamNumber: "asc" },
    });
    expect(
      after.map((r) => [r.teamNumber, r.inputSha256, r.totalPoints]),
    ).toEqual(before.map((r) => [r.teamNumber, r.inputSha256, r.totalPoints]));
  },
);

run(
  "archive restores only missing scoped inputs, preserves live rows, and yields to new reports",
  async () => {
    const input = {
      ...f,
      matchKey,
      reports: f.reports.map((r) => ({ ...r, sourceTeamNumber: source })),
      ocr: { ...f.ocr, matchKey },
      tba: { ...f.tba, key: matchKey },
    };
    const archive = buildEstimateArchive([input], [source]);
    await db.$executeRawUnsafe(archive.sql);
    expect(
      await db.estimatedScore.count({
        where: { matchKey, inputOrigin: "ARCHIVE" },
      }),
    ).toBe(6);
    expect(
      await db.estimatedScore.count({
        where: { matchKey, inputOrigin: "LIVE" },
      }),
    ).toBe(6);
    expect(await refreshMatchEstimates(db, matchKey, [source])).toBe(0);
    expect(
      await db.estimatedScore.count({
        where: { matchKey, inputOrigin: "ARCHIVE" },
      }),
    ).toBe(6);
    expect(
      await db.estimatedScore.count({
        where: { matchKey, inputOrigin: "LIVE" },
      }),
    ).toBe(6);
    await db.$executeRawUnsafe(archive.sql);
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(12);
    const scout = await db.scouter.create({
      data: { sourceTeamNumber: source },
    });
    await db.scoutReport.create({
      data: {
        teamMatchKey: `${matchKey}_3`,
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
      },
    });
    expect(await db.estimatedScore.count({ where: { matchKey } })).toBe(0);
    await expect(
      Promise.resolve(db.$executeRawUnsafe(archive.sql)),
    ).rejects.toThrow("Archive prerequisites changed");
    await refreshMatchEstimates(db, matchKey);
    expect(
      await db.estimatedScore.count({
        where: { matchKey, inputOrigin: "ARCHIVE" },
      }),
    ).toBe(0);
    expect(
      await db.estimatedScore.count({
        where: { matchKey, inputOrigin: "LIVE" },
      }),
    ).toBeGreaterThan(0);
  },
);
