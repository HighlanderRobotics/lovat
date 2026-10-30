import { expect, test } from "bun:test";
import { createHealthApp } from "../src/server";
import {
  analysisEventAllowed,
  controlAuthorized,
} from "../src/ocr/event-control";
import { reportSourceHandler } from "../tools/report-source-service";
const token = "test-token-".repeat(5);
test("event control is authenticated and limited to the approved event keys", async () => {
  const calls: string[] = [];
  const app = createHealthApp({
    isReady: () => true,
    checkDatabase: async () => {},
    ocr: {
      token,
      enqueue: async (e) => {
        calls.push(e);
        return { eventKey: e, status: "QUEUED" };
      },
      status: async (e) => ({ eventKey: e, status: "RUNNING" }),
    },
  });
  expect(
    (await app.request("/ocr/events/2026casnf", { method: "POST" })).status,
  ).toBe(401);
  expect(
    (
      await app.request("/ocr/events/2026casnf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: "{}",
      })
    ).status,
  ).toBe(202);
  expect(calls).toEqual(["2026casnf"]);
  expect(
    (
      await app.request("/ocr/events/2026other", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await app.request("/ocr/events/2026cagle", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/ocr/events/2026cagle", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: '{"url":"https://evil.example"}',
      })
    ).status,
  ).toBe(400);
  expect(controlAuthorized(`Bearer ${token}`, "short")).toBe(false);
  expect(controlAuthorized(`Bearer wrong`, token)).toBe(false);
  expect(analysisEventAllowed("2026casnf")).toBe(true);
  expect(analysisEventAllowed("../2026casnf")).toBe(false);
});
test("source bridge returns only view payloads, never arbitrary queries or operational errors", async () => {
  let calls = 0;
  const handler = reportSourceHandler({
    token,
    read: async (e, after) => {
      calls++;
      return [
        { reportUuid: "a", payload: { uuid: "a", sourceTeamNumber: 8033 } },
      ];
    },
  });
  const request = (path: string, method = "GET") =>
    new Request("https://source.example" + path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  expect(
    (await handler(new Request("https://source.example/reports/2026casnf")))
      .status,
  ).toBe(401);
  for (const path of [
    "/reports/2026other",
    "/reports/2026casnf?sql=DROP",
    "/reports/2026casnf?after=bad",
  ])
    expect((await handler(request(path))).status).toBe(400);
  expect((await handler(request("/reports/2026casnf", "POST"))).status).toBe(
    400,
  );
  expect(calls).toBe(0);
  const result = await handler(request("/reports/2026casnf"));
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.json()).toEqual({
    eventKey: "2026casnf",
    reports: [{ uuid: "a", sourceTeamNumber: 8033 }],
    nextCursor: null,
  });
  const failed = reportSourceHandler({
    token,
    read: async () => {
      throw Error("postgres://secret");
    },
  });
  const denied = await failed(request("/reports/2026casnf"));
  expect(denied.status).toBe(503);
  expect(await denied.text()).not.toContain("secret");
});
