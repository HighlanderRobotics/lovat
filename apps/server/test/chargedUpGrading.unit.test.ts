import { describe, expect, it } from "vitest";
import { chargedUpFixture } from "./fixtures/chargedUpTraining.js";
import {
  chargedUpAnswer,
  chargedUpFields,
  compareChargedUpReports,
} from "../src/handler/training/chargedUpGrading.js";
import { canRecordEvent } from "../src/handler/training/chargedUpReport.js";

describe("Charged Up training grading", () => {
  it("gives a perfect report full credit independent of metadata", () => {
    const expected = chargedUpFixture();
    expect(
      compareChargedUpReports(chargedUpFixture(), expected).overallScore,
    ).toBe(100);
    expect(chargedUpAnswer({ gameYear: 2026 })).toBeNull();
  });
  it("requires the correct grid node even when piece totals match", () => {
    const expected = chargedUpFixture();
    const actual = structuredClone(expected);
    actual.events[5].scoringLocation = "E2";
    const grade = compareChargedUpReports(actual, expected);
    expect(grade.breakdown.quantities.every((q) => q.score === 1)).toBe(true);
    expect(grade.breakdown.timeline.matched).toBe(6);
    expect(grade.overallScore).toBeLessThan(100);
  });
  it("allows two seconds of timing error and five points of starting-position error", () => {
    const expected = chargedUpFixture();
    const actual = structuredClone(expected);
    actual.events[0].position = 55;
    actual.events[1].time += 2;
    expect(compareChargedUpReports(actual, expected).overallScore).toBe(100);
    actual.events[1].time += 0.01;
    expect(
      compareChargedUpReports(actual, expected).breakdown.timeline.matched,
    ).toBe(6);
  });
  it("penalizes extra or missing events without matching an event twice", () => {
    const expected = chargedUpFixture();
    const actual = structuredClone(expected);
    actual.events.push({ ...actual.events[1] });
    const grade = compareChargedUpReports(actual, expected);
    expect(grade.breakdown.timeline.matched).toBe(7);
    expect(grade.breakdown.timeline.score).toBeLessThan(1);
    expect(grade.breakdown.quantities[0].score).toBe(0);
    actual.events = [];
    expect(compareChargedUpReports(actual, expected).overallScore).toBe(20);
  });
  it("compares role sets and respects excluded subjective questions", () => {
    const expected = chargedUpFixture({ robotRoles: ["OFFENCE", "DEFENCE"] });
    const actual = chargedUpFixture({
      robotRoles: ["DEFENCE", "OFFENCE"],
      driverAbility: 1,
    });
    expect(
      compareChargedUpReports(actual, expected, ["driverAbility"]).overallScore,
    ).toBe(100);
    expect(
      compareChargedUpReports(actual, expected, [...chargedUpFields])
        .overallScore,
    ).toBe(100);
    expect(compareChargedUpReports(actual, expected).overallScore).toBe(98);
  });
  it("rejects scoring the wrong held piece or an incompatible elevated node", () => {
    expect(
      canRecordEvent([], "CONE", {
        action: "SCORE_CUBE",
        location: "SCORE",
        scoringLocation: "B2",
      }),
    ).toBe(false);
    expect(
      canRecordEvent([], "CONE", {
        action: "SCORE_CONE",
        location: "SCORE",
        scoringLocation: "B2",
      }),
    ).toBe(false);
    expect(
      canRecordEvent([], "CONE", {
        action: "SCORE_CONE",
        location: "SCORE",
        scoringLocation: "B3",
      }),
    ).toBe(true);
  });
});
