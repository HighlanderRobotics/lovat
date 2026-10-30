import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@lovat/db";
import { importSourceReports } from "../src/ocr/report-source";
import { sourceFixture } from "./fixtures/report-source";
const enabled = process.env.LOVAT_DB_TEST === "1";
const run = enabled ? test : test.skip;
const eventKey = `2026source${randomUUID().replaceAll("-", "")}`;
const source = 2000000 + Math.floor(Math.random() * 1000000);
const row = { ...sourceFixture(), sourceTeamNumber: source, matchKey: null };
let db: PrismaClient;
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
  await db.team.upsert({
    where: { number: 118 },
    create: { number: 118, name: "Synthetic" },
    update: {},
  });
  await db.tournament.create({
    data: { key: eventKey, name: "Synthetic source test" },
  });
  await db.match.create({
    data: {
      key: `${eventKey}_qm1`,
      tournamentKey: eventKey,
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 1,
    },
  });
  await db.teamMatchData.create({
    data: {
      key: `${eventKey}_qm1_118`,
      matchKey: `${eventKey}_qm1`,
      teamNumber: 118,
      tournamentKey: eventKey,
      matchType: "QUALIFICATION",
      matchNumber: 1,
      alliance: "RED",
      station: 1,
    },
  });
});
afterAll(async () => {
  if (!enabled || !db) return;
  await db.tournament.deleteMany({ where: { key: eventKey } });
  await db.scouter.deleteMany({ where: { sourceTeamNumber: source } });
  await db.registeredTeam.deleteMany({ where: { number: source } });
  await db.team.deleteMany({ where: { number: source } });
  await db.$disconnect();
});
run(
  "numeric sync maps legacy match identities, preserves attribution and is additive",
  async () => {
    expect(await importSourceReports(db, eventKey, [row])).toEqual({
      sourceReports: 1,
      imported: 1,
    });
    const stored = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: row.uuid },
      include: { events: true, scouter: true },
    });
    expect(stored.teamMatchKey).toBe(`${eventKey}_qm1_118`);
    expect(stored.notes).toBe("");
    expect(stored.scouter.sourceTeamNumber).toBe(source);
    expect(stored.events[0]?.eventUuid).toBe(row.events[0]?.eventUuid);
    await db.scoutReport.update({
      where: { uuid: row.uuid },
      data: { notes: "Preview only note", analysisExcluded: true },
    });
    await db.event.update({
      where: { eventUuid: row.events[0]!.eventUuid },
      data: { analysisExcluded: true },
    });
    expect(await importSourceReports(db, eventKey, [row])).toEqual({
      sourceReports: 1,
      imported: 0,
    });
    const preserved = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: row.uuid },
      include: { events: true },
    });
    expect(preserved.notes).toBe("Preview only note");
    expect(preserved.analysisExcluded).toBe(true);
    expect(preserved.events[0]?.analysisExcluded).toBe(true);
  },
);
run(
  "changed numeric evidence fails without replacing reports or adding partial rows",
  async () => {
    await expect(
      importSourceReports(db, eventKey, [{ ...row, driverAbility: 5 }]),
    ).rejects.toThrow("differs");
    await expect(
      importSourceReports(db, eventKey, [
        { ...row, events: row.events.map((e) => ({ ...e, time: 6 })) },
      ]),
    ).rejects.toThrow("differs");
    const missing = { ...row, uuid: randomUUID(), teamNumber: 9999999 };
    const fresh = { ...row, uuid: randomUUID(), events: [] };
    await expect(
      importSourceReports(db, eventKey, [fresh, missing]),
    ).rejects.toThrow("canonical match slot");
    expect(await db.scoutReport.count({ where: { uuid: fresh.uuid } })).toBe(0);
    expect(
      (await db.scoutReport.findUniqueOrThrow({ where: { uuid: row.uuid } }))
        .driverAbility,
    ).toBe(row.driverAbility);
  },
);
run(
  "source exclusions are imported without clearing preview decisions",
  async () => {
    const excluded = {
      ...row,
      uuid: randomUUID(),
      analysisExcluded: true,
      events: row.events.map((e) => ({
        ...e,
        eventUuid: randomUUID(),
        analysisExcluded: true,
      })),
    };
    await importSourceReports(db, eventKey, [excluded]);
    const stored = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: excluded.uuid },
      include: { events: true },
    });
    expect(stored.analysisExcluded).toBe(true);
    expect(stored.events[0]?.analysisExcluded).toBe(true);
    await importSourceReports(db, eventKey, [
      {
        ...excluded,
        analysisExcluded: false,
        events: excluded.events.map((e) => ({ ...e, analysisExcluded: false })),
      },
    ]);
    const preserved = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: excluded.uuid },
      include: { events: true },
    });
    expect(preserved.analysisExcluded).toBe(true);
    expect(preserved.events[0]?.analysisExcluded).toBe(true);
  },
);
