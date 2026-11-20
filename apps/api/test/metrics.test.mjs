import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { analyzeReports } from "../dist/metrics/engine.js";
import { season2026 } from "../dist/metrics/season2026.js";
import { prepareFacts } from "../dist/metrics/facts.js";
import { defineMetric, MetricRegistry } from "../dist/metrics/registry.js";
import { report, event } from "./fixtures.mjs";

const request = (metrics, extras = {}) => ({
  teams: [8033],
  metrics,
  season: 2026,
  timeline: false,
  ...extras,
});
const values = (reports, metrics) =>
  analyzeReports(reports, request(metrics), season2026).teams["8033"].metrics;
test("rates pool quantities and durations across reports before computing a match", () => {
  const a = report({
    events: [event("START_FEEDING", 1), event("STOP_FEEDING", 11, 10)],
  });
  const b = report({
    uuid: "report2",
    events: [event("START_FEEDING", 1), event("STOP_FEEDING", 6, 30)],
  });
  assert.equal(values([a, b], ["feedingRate"]).feedingRate.value, 40 / 15);
  assert.equal(values([report()], ["feedingRate"]).feedingRate.value, null);
  assert.equal(values([report()], ["totalBallsFed"]).totalBallsFed.value, 0);
});
test("matches have equal weight regardless of the number of scouts", () => {
  const reports = [
    report({ driverAbility: 5 }),
    report({ uuid: "b", driverAbility: 5 }),
    report({ uuid: "c", matchKey: "qm2", driverAbility: 1 }),
  ];
  const result = values(reports, ["driverAbility"]).driverAbility;
  assert.deepEqual(result, { value: 3, samples: 2, version: 1 });
});
test("recency weighting is deterministic for shuffled input and tied dates", () => {
  const a = report({
    driverAbility: 1,
    tournamentKey: "a",
    tournamentDate: "2026-01-01",
  });
  const b = report({
    uuid: "b",
    driverAbility: 5,
    tournamentKey: "b",
    tournamentDate: "2026-03-01",
  });
  assert.equal(values([b, a], ["driverAbility"]).driverAbility.value, 4.2);
  assert.deepEqual(
    values([a, b], ["driverAbility"]),
    values([b, a], ["driverAbility"]),
  );
});
test("facts pair valid intervals once and preserve input ordering", () => {
  const input = report({
    events: [
      event("STOP_FEEDING", 10),
      event("START_FEEDING", 1),
      event("START_FEEDING", 4),
      event("STOP_FEEDING", 11),
      event("START_SCORING", 20),
      event("STOP_SCORING", 20.2, 1),
    ],
  });
  const before = structuredClone(input);
  assert.equal(prepareFacts(input).durations.START_FEEDING, 9);
  assert.equal(prepareFacts(input).durations.START_SCORING, undefined);
  assert.deepEqual(input, before);
});
test("dependencies and aliases evaluate once and hidden dependencies stay hidden", () => {
  const r = values(
    [
      report({
        events: [
          event("START_DEFENDING", 1),
          event("STOP_DEFENDING", 5),
          event("START_CAMPING", 10),
          event("STOP_CAMPING", 12),
        ],
      }),
    ],
    ["totalDefenseTime", "totalBallThroughPut"],
  );
  assert.equal(r.totalDefenseTime.value, 6);
  assert.equal(r.totalBallThroughput.value, 0);
  assert.equal(r.contactDefenseTime, undefined);
});
test("categorical metrics count match proportions and preserve zero categories", () => {
  const result = values(
    [report(), report({ uuid: "b", robotRoles: ["DEFENDING"] })],
    ["robotRole"],
  ).robotRole.value;
  assert.equal(result.CYCLING, 0.5);
  assert.equal(result.DEFENDING, 0.5);
  assert.equal(result.IMMOBILE, 0);
});
test("points apply accuracy once and keep climb points separate", () => {
  const r = report({
    accuracy: 1,
    autoClimb: "SUCCEEDED",
    endgameClimb: "L2",
    events: [event("STOP_SCORING", 20, 10), event("STOP_SCORING", 40, 20)],
  });
  assert.equal(values([r], ["totalPoints"]).totalPoints.value, 51.5);
  assert.equal(values([r], ["autoPoints"]).autoPoints.value, 20.5);
});
test("climb metrics distinguish missing, failed and successful attempts", () => {
  const a = report({ events: [event("CLIMB", 20), event("CLIMB", 140)] });
  assert.equal(
    values([a], ["autoClimbStartTime"]).autoClimbStartTime.value,
    null,
  );
  assert.equal(
    values([report({ ...a, autoClimb: "SUCCEEDED" })], ["autoClimbStartTime"])
      .autoClimbStartTime.value,
    3,
  );
  assert.equal(
    values([report({ ...a, endgameClimb: "L2" })], ["l2StartTime"]).l2StartTime
      .value,
    18,
  );
});
test("no data returns null with zero samples and timeline is optional", () => {
  const result = analyzeReports([], request(["totalPoints"]), season2026).teams[
    "8033"
  ];
  assert.deepEqual(result.metrics.totalPoints, {
    value: null,
    samples: 0,
    version: 1,
  });
  assert.equal(result.timeline, undefined);
  assert.equal(
    analyzeReports(
      [report()],
      request(["totalPoints"], { timeline: true }),
      season2026,
    ).teams["8033"].timeline.length,
    1,
  );
});
test("registry rejects cycles, alias collisions and unknown dependencies", () => {
  const base = season2026.get("totalPoints");
  const def = (id, dependencies = [], aliases = []) => ({
    ...base,
    metadata: { ...base.metadata, id, dependencies, aliases },
  });
  assert.throws(
    () => new MetricRegistry([def("a", ["b"]), def("b", ["a"])]),
    /cycle/,
  );
  assert.throws(
    () => new MetricRegistry([def("a"), def("b", [], ["a"])]),
    /Duplicate/,
  );
  assert.throws(() => new MetricRegistry([def("a", ["missing"])]), /Unknown/);
});
test("custom structured metrics are schema validated", () => {
  const custom = defineMetric({
    metadata: {
      ...season2026.get("totalPoints").metadata,
      id: "custom",
      kind: "structured",
    },
    output: z.object({ maximum: z.number() }),
    calculate: (f) => f.report.driverAbility,
    reports: (v) => ({ maximum: Math.max(...v) }),
    aggregate: (v) =>
      v.length ? { maximum: Math.max(...v.map((x) => x.maximum)) } : null,
  });
  assert.deepEqual(
    analyzeReports(
      [report()],
      request(["custom"]),
      new MetricRegistry([custom]),
    ).teams["8033"].metrics.custom.value,
    { maximum: 3 },
  );
});
