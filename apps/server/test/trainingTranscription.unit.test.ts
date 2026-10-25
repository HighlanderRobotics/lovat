import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/training/118-johnson-qual-19.json";
import report from "./fixtures/training/118-johnson-qual-19.report.json";
import { reportSchema } from "../src/handler/collection/reportSchema.js";
import { EventActionMap } from "../src/handler/manager/managerConstants.js";

describe("118 Johnson qualification 19 transcription", () => {
  it("encodes observed post-match fields using the real report contract", () => {
    expect(reportSchema.parse(report)).toEqual({
      ...report,
      customPostMatch: [],
    });
    expect(report).toMatchObject({
      teamNumber: 118,
      matchType: "QUALIFICATION",
      matchNumber: 19,
      robotRoles: ["CYCLING", "SCORING"],
      accuracy: 4,
      driverAbility: 5,
      scoresWhileMoving: true,
    });
  });

  it("preserves each source observation without dropping the disputed block", () => {
    const source = readFileSync(
      new URL(
        "./fixtures/training/118-johnson-qual-19.source.txt",
        import.meta.url,
      ),
      "utf8",
    );
    const timedLines = source
      .split("\n")
      .filter((line) => /^\d+:\d{2} /.test(line));

    expect(
      fixture.timeline.map((row) => `${row.sourceTime} ${row.text}`),
    ).toEqual(timedLines);
  });

  it("preserves raw fuel quantities across every scoring and feeding run", () => {
    const scoring = fixture.timeline.filter(
      (row) => row.action === "STOP_SCORING",
    );
    const feeding = fixture.timeline.filter(
      (row) => row.action === "STOP_FEEDING",
    );
    const fuel = (rows: typeof scoring) =>
      rows.reduce((total, row) => total + row.quantity!, 0);

    expect(fuel(scoring.filter((row) => row.phase === "AUTO"))).toBe(64);
    expect(fuel(scoring.filter((row) => row.phase === "TELEOP"))).toBe(143);
    expect(fuel(scoring)).toBe(207);
    expect(fuel(feeding)).toBe(28);
    expect(scoring).toHaveLength(12);
    expect(feeding).toHaveLength(2);
  });

  it("maps every definite action to a supported Collection action", () => {
    const supported = Object.values(EventActionMap);

    for (const row of fixture.timeline) {
      if (row.action !== null) {
        expect(supported).toContain(row.action);
      }
    }
  });

  it("applies the confirmed minute correction and three-second transition", () => {
    expect(report.events).toContainEqual([128, 0, 2]);
    expect(report.events).toContainEqual([130, 1, 2, 15]);
    expect(report.events.at(-1)).toEqual([163, 1, 2, 1]);
    expect(
      report.events.every(
        (event, index, events) =>
          index === 0 || event[0] >= events[index - 1][0],
      ),
    ).toBe(true);
    expect(report.events.slice(0, 2)).toEqual([
      [0, 2, 3],
      [0, 10, 3],
    ]);
  });

  it("keeps unobserved fields out of grading and does not invent an Outpost action", () => {
    expect(fixture.status).toBe("TRANSCRIBED");
    expect(fixture.sameRobotForAllScouts).toBe(true);
    expect(report.endgameClimb).toBe("NOT_ATTEMPTED");
    expect(report.tournamentKey).toBe("2026joh");
    expect(fixture.grading.excludeFields).toEqual([
      "feederTypes",
      "disrupts",
      "defenseEffectiveness",
    ]);

    const visit = fixture.timeline.find((row) => row.text === "Into Outpost");
    expect(visit).toMatchObject({
      sourceTime: "1:01",
      correctedTime: "2:01",
      reportSeconds: 124,
      action: null,
      position: "OUTPOST",
    });
    expect(report.events.some((event) => event[2] === 7)).toBe(false);
  });
});
