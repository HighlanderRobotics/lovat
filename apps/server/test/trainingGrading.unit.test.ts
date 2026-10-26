import { describe, expect, it } from "vitest";
import fixture from "./fixtures/training/118-johnson-qual-19.report.json";
import {
  compareTrainingReports,
  reportEvents,
} from "../src/handler/training/gradeReport.js";

const answer = { ...fixture, events: reportEvents(fixture.events) };
describe("training-v2 grading", () => {
  it("gives the transcribed 118 report a perfect score against itself", () => {
    const result = compareTrainingReports(answer, answer);
    expect(result.overallScore).toBe(100);
    expect(result.breakdown.quantities.map((q) => q.expected)).toEqual([
      207, 28,
    ]);
  });
  it("matches events one-to-one within five seconds and ignores report wall-clock time", () => {
    expect(
      compareTrainingReports(
        {
          ...answer,
          startTime: 123456,
          events: answer.events.map((e) => ({ ...e, time: e.time + 1.5 })),
        },
        answer,
      ).overallScore,
    ).toBe(100);
    const extra = {
      ...answer,
      events: [...answer.events, { ...answer.events[0] }],
    };
    expect(compareTrainingReports(extra, answer).overallScore).toBeLessThan(
      100,
    );
  });
  it("penalizes missed fuel and reports the exact observed count", () => {
    const events = answer.events.map((e) =>
      e.action === "STOP_SCORING" ? { ...e, quantity: 0 } : e,
    );
    const result = compareTrainingReports({ ...answer, events }, answer);
    expect(result.overallScore).toBe(75);
    expect(result.breakdown.quantities[0]).toMatchObject({
      expected: 207,
      actual: 0,
      score: 0,
    });
  });
  it("penalizes wrong per-run quantities even when the total is correct", () => {
    const events = answer.events.map((event) =>
      event.time === 8
        ? { ...event, quantity: 10 }
        : event.time === 17
          ? { ...event, quantity: 54 }
          : event,
    );
    const result = compareTrainingReports({ ...answer, events }, answer);
    expect(result.breakdown.quantities[0].actual).toBe(207);
    expect(result.overallScore).toBeLessThan(100);
  });
  it("compares roles without depending on selection order", () => {
    expect(
      compareTrainingReports(
        { ...answer, robotRoles: [...answer.robotRoles].reverse() },
        answer,
      ).overallScore,
    ).toBe(100);
  });
  it("compares traversal and climb fields while excluding unobserved fields", () => {
    const actual = { ...answer, mobility: "NONE", endgameClimb: "L3" };
    expect(compareTrainingReports(actual, answer).overallScore).toBeLessThan(
      100,
    );
    expect(
      compareTrainingReports(actual, answer, ["mobility", "endgameClimb"])
        .overallScore,
    ).toBe(100);
  });
  it("does not grade notes or subjective driver ratings", () => {
    expect(
      compareTrainingReports(
        { ...answer, notes: "different", driverAbility: 1 },
        answer,
      ).overallScore,
    ).toBe(100);
  });
});

it("allows five seconds but penalizes events beyond the window", () => {
  const shifted = (seconds: number) => ({
    ...answer,
    events: answer.events.map((event) => ({
      ...event,
      time: event.time + seconds,
    })),
  });
  expect(compareTrainingReports(shifted(5), answer).overallScore).toBe(100);
  expect(
    compareTrainingReports(shifted(5.01), answer).overallScore,
  ).toBeLessThan(100);
});
it("allows small fuel-count estimates and explains count and timing differences", () => {
  const actual = {
    ...answer,
    events: answer.events.map((event) =>
      event.time === 8
        ? {
            ...event,
            time: event.time + 4,
            quantity: (event.quantity ?? 0) + 3,
          }
        : event,
    ),
  };
  const result = compareTrainingReports(actual, answer);
  expect(result.overallScore).toBe(100);
  expect(result.breakdown.rubricVersion).toBe("training-v2");
  expect(result.breakdown.quantities[0].differences[0]).toMatchObject({
    time: 8,
    expected: 36,
    actual: 39,
    allowance: 6,
  });
  expect(result.breakdown.timeline.differences[0]).toMatchObject({
    expectedTime: 8,
    actualTime: 12,
    deltaSeconds: 4,
  });
});
it("records missing and extra events separately and never grants free unexpected fuel", () => {
  const expected = {
    events: [
      { action: "STOP_SCORING", position: "NONE", time: 10, quantity: 0 },
    ],
  };
  const actual = {
    events: [
      { action: "STOP_SCORING", position: "NONE", time: 30, quantity: 3 },
    ],
  };
  const result = compareTrainingReports(actual, expected);
  expect(result.breakdown.quantities[0].score).toBe(0);
  expect(result.breakdown.timeline.differences).toEqual([
    {
      action: "STOP_SCORING",
      position: "NONE",
      expectedTime: 10,
      actualTime: null,
      deltaSeconds: null,
    },
    {
      action: "STOP_SCORING",
      position: "NONE",
      expectedTime: null,
      actualTime: 30,
      deltaSeconds: null,
    },
  ]);
});
