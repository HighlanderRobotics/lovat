import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  createFullMatchScheduleHandler,
  formatMatchSchedule,
} from "../src/handler/manager/fullMatchSchedule.js";

const rows = Array.from({ length: 150 }, (_, i) =>
  Array.from({ length: 6 }, (_, position) => ({
    key: `2023mock_qm${i + 1}_${position}`,
    matchNumber: i + 1,
    matchType: "QUALIFICATION",
    teamNumber: position + 100,
  })),
).flat();
function response() {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
  };
  return result;
}
const req = (code?: string) =>
  ({
    headers: code ? { "x-team-code": code } : {},
    params: { tournament: "2023mock" },
  }) as unknown as Request;
test("returns all 150 matches, all six teams and correct alliances without report data", async () => {
  const result = response();
  const handler = createFullMatchScheduleHandler({
    authorize: async () => true,
    refresh: async () => undefined,
    read: async () => rows,
  });
  await handler(req("test"), result as unknown as Response);
  const body = result.body as ReturnType<typeof formatMatchSchedule>;
  assert.equal(body.matches.length, 150);
  assert.equal(body.matches.at(-1)?.matchNumber, 150);
  assert.deepEqual(
    body.matches[0].teams.map((t) => t.alliance),
    ["red", "red", "red", "blue", "blue", "blue"],
  );
  assert.deepEqual(Object.keys(body.matches[0]).sort(), [
    "matchNumber",
    "matchType",
    "teams",
  ]);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});
test("rejects missing and invalid team credentials before schedule reads or refreshes", async () => {
  let reads = 0;
  const handler = createFullMatchScheduleHandler({
    authorize: async () => false,
    refresh: async () => {
      reads++;
    },
    read: async () => {
      reads++;
      return rows;
    },
  });
  for (const [code, expected] of [
    [undefined, 400],
    ["invalid", 401],
  ] as const) {
    const result = response();
    await handler(req(code), result as unknown as Response);
    assert.equal(result.statusCode, expected);
  }
  assert.equal(reads, 0);
});
test("upstream errors preserve imported fixtures and an unavailable schedule is an error", async () => {
  for (const [fixtures, expected] of [
    [rows, 200],
    [[], 404],
  ] as const) {
    const result = response();
    const handler = createFullMatchScheduleHandler({
      authorize: async () => true,
      refresh: async () => {
        throw new Error("provider offline");
      },
      read: async () => [...fixtures],
    });
    await handler(req("test"), result as unknown as Response);
    assert.equal(result.statusCode, expected);
  }
});
test("does not merge different match types and leaves unknown alliance positions unset", () => {
  const schedule = formatMatchSchedule("2023mock", [
    rows[0],
    { ...rows[0], key: "custom_unknown", matchType: "PRACTICE" },
    { ...rows[0], key: "elim_3", matchType: "ELIMINATION" },
  ]);
  assert.equal(schedule.matches.length, 3);
  assert.equal(
    schedule.matches.find((m) => m.matchType === 2)?.teams[0].alliance,
    null,
  );
});
