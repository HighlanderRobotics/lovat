import { expect, test } from "bun:test";
import { examineReportAlignment } from "../src/ocr/report-alignment-experiment";
import { fixture } from "./fixtures/official-fusion";

function isolated(lags = [2, 2, 2, 2]) {
  const input = fixture();
  const starts = [38, 58, 78, 98];
  const report = input.reports[0]!;
  report.teamNumber = 1;
  report.events = starts.flatMap((t, i) => [
    { eventUuid: `${i}s`, time: t, action: "START_SCORING", quantity: 0 },
    { eventUuid: `${i}e`, time: t + 2, action: "STOP_SCORING", quantity: 6 },
  ]);
  input.reports = [report];
  input.ocr.observations = Array.from({ length: 164 }, (_, time) => ({
    time, red: starts.reduce((sum, t, i) => sum +
      (time >= t + lags[i]! + 1 ? 3 : 0) + (time >= t + lags[i]! + 2 ? 3 : 0), 0),
    blue: 0, confidence: 95,
  }));
  const b = input.tba.score_breakdown.red;
  Object.assign(b.hubScore, { autoCount: 0, autoPoints: 0, teleopCount: 24,
    teleopPoints: 24, totalCount: 24, totalPoints: 24, endgameCount: 0, endgamePoints: 0 });
  Object.assign(b, { totalAutoPoints: 0, totalTeleopPoints: 24, totalPoints: 29 });
  input.tba.alliances.red.score = 29;
  return input;
}

test("report net-lag experiment fits isolated bursts and validates on unused bursts without mutating input", () => {
  const input = isolated();
  const original = JSON.stringify(input);
  const result = examineReportAlignment(input, [8033]);
  expect(result.promoted).toBe(false);
  expect(result.reports[0]).toMatchObject({
    status: "candidate-awaiting-independent-validation", candidateOffsetMs: 2000,
    fitBursts: 2, validationBursts: 2, validationErrorMs: 0, validationBaselineErrorMs: 2000,
  });
  expect(JSON.stringify(input)).toBe(original);
  const reordered = structuredClone(input);
  reordered.reports[0]!.events.reverse();
  reordered.ocr.observations.reverse();
  expect(examineReportAlignment(reordered, [8033])).toEqual(result);
});

test("report alignment abstains on overlapping robots, inconsistent lag, sparse OCR and phase boundaries", () => {
  const overlap = isolated();
  overlap.reports.push({ ...structuredClone(overlap.reports[0]!), uuid: "competitor", teamNumber: 2 });
  const crowded = examineReportAlignment(overlap, [8033]);
  expect(crowded.reports.every(r => r.candidateOffsetMs === null)).toBe(true);
  expect(crowded.reports[0]!.rejections["overlapping-scout-bursts"]).toBe(4);
  expect(examineReportAlignment(isolated([2, -2, 2, -2]), [8033]).reports[0]!.status).toBe("inconsistent-lag");
  const sparse = isolated();
  sparse.ocr.observations = sparse.ocr.observations.filter(o => o.time % 3 === 0);
  expect(examineReportAlignment(sparse, [8033]).reports[0]!.candidateOffsetMs).toBeNull();
  const boundary = isolated();
  boundary.reports[0]!.events = boundary.reports[0]!.events.map(e => ({ ...e, time: e.time - 80 }));
  // Keep input valid while moving all evidence into AUTO/boundary windows.
  boundary.reports[0]!.events = boundary.reports[0]!.events.filter(e => e.time >= 0);
  expect(examineReportAlignment(boundary, [8033]).reports[0]!.candidateOffsetMs).toBeNull();
});

test("report alignment respects source scope and excluded reports and does not force a nonzero offset", () => {
  expect(examineReportAlignment(isolated([0, 0, 0, 0]), [8033]).reports[0]!.status).toBe("already-aligned");
  expect(examineReportAlignment(isolated(), [1967]).reports).toHaveLength(0);
  const excluded = isolated();
  Object.assign(excluded.reports[0]!, { analysisExcluded: true });
  expect(examineReportAlignment(excluded, [8033]).reports).toHaveLength(0);
  expect(() => examineReportAlignment(isolated(), [])).toThrow("source-team scope");
});
