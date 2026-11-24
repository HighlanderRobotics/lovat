import { expect, test } from "@jest/globals";
import { splitScoutReportIntoCodes } from "../../lib/collection/qrPayload";
import { makeReport } from "./fixtures";

test("multi-code transfer preserves the exact payload, offset ordering and immutable UUID", () => {
  const report = makeReport({ notes: "Synthetic — 🤖 ".repeat(40) });
  const codes = splitScoutReportIntoCodes(report, 80);
  expect(codes.length).toBeGreaterThan(1);
  expect(JSON.parse(codes.map((c) => c.data).join(""))).toEqual(report);
  codes.forEach((c, i) => {
    expect(c.uuid).toBe(report.uuid);
    expect(c.index).toBe(i * 80);
    expect(c.total).toBe(codes.length);
  });
});
test.each([0, -1, 0.5, NaN])(
  "invalid chunk size %s fails rather than looping forever",
  (length) => {
    expect(() => splitScoutReportIntoCodes(makeReport(), length)).toThrow(
      "positive integer",
    );
  },
);
