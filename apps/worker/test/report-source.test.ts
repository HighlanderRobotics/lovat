import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  readSourceReports,
  importSourceReports,
} from "../src/ocr/report-source";
import type { PrismaClient } from "@lovat/db";
const savedUrl = process.env.OCR_REPORT_SOURCE_URL;
const savedToken = process.env.OCR_REPORT_SOURCE_TOKEN;
afterAll(() => {
  if (savedUrl === undefined) delete process.env.OCR_REPORT_SOURCE_URL;
  else process.env.OCR_REPORT_SOURCE_URL = savedUrl;
  if (savedToken === undefined) delete process.env.OCR_REPORT_SOURCE_TOKEN;
  else process.env.OCR_REPORT_SOURCE_TOKEN = savedToken;
});
import { sourceFixture } from "./fixtures/report-source";

function config() {
  process.env.OCR_REPORT_SOURCE_URL = "https://source.example";
  process.env.OCR_REPORT_SOURCE_TOKEN = "numeric-source-token-".repeat(3);
}
function fetcher(fn: (url: URL, init?: RequestInit) => Response) {
  return ((url: Parameters<typeof fetch>[0], init?: RequestInit) =>
    Promise.resolve(fn(new URL(String(url)), init))) as typeof fetch;
}
test("source reader validates pagination and sends only the bearer to the configured service", async () => {
  config();
  const first = sourceFixture(),
    second = sourceFixture();
  first.uuid = "00000000-0000-4000-8000-000000000001";
  second.uuid = "00000000-0000-4000-8000-000000000002";
  let calls = 0;
  const rows = await readSourceReports(
    "2026casnf",
    fetcher((url, init) => {
      expect(url.origin).toBe("https://source.example");
      expect(url.pathname).toBe("/reports/2026casnf");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${process.env.OCR_REPORT_SOURCE_TOKEN}`,
      );
      const report = calls++ === 0 ? first : second;
      if (calls === 2) expect(url.searchParams.get("after")).toBe(first.uuid);
      return Response.json({
        eventKey: "2026casnf",
        reports: [report],
        nextCursor: calls === 1 ? first.uuid : null,
      });
    }),
  );
  expect(rows).toEqual([first, second]);
});
test("source reader rejects mixed events, duplicated reports, unsafe cursors and sensitive fields", async () => {
  config();
  for (const change of [
    { eventKey: "2026cagle" },
    { reports: [{ ...sourceFixture(), matchKey: "2026cagle_qm1" }] },
    { reports: [{ ...sourceFixture(), notes: "private" }] },
    { nextCursor: randomUUID() },
  ]) {
    await expect(
      readSourceReports(
        "2026casnf",
        fetcher(() =>
          Response.json({
            eventKey: "2026casnf",
            reports: [sourceFixture()],
            nextCursor: null,
            ...change,
          }),
        ),
      ),
    ).rejects.toThrow();
  }
  const row = sourceFixture();
  await expect(
    readSourceReports(
      "2026casnf",
      fetcher(() =>
        Response.json({
          eventKey: "2026casnf",
          reports: [row, row],
          nextCursor: null,
        }),
      ),
    ),
  ).rejects.toThrow("identity");
});
test("source reader fails closed for missing config, insecure URLs and HTTP errors", async () => {
  config();
  await expect(
    readSourceReports(
      "2026casnf",
      fetcher(() => new Response("private upstream details", { status: 503 })),
    ),
  ).rejects.toThrow("Report source unavailable");
  process.env.OCR_REPORT_SOURCE_URL = "http://source.example";
  await expect(readSourceReports("2026casnf")).rejects.toThrow("configuration");
  process.env.OCR_REPORT_SOURCE_TOKEN = "short";
  await expect(readSourceReports("2026casnf")).rejects.toThrow("configured");
});
test("import rejects conflicting source ownership and duplicate reports before writing", async () => {
  const row = sourceFixture();
  const db = {} as PrismaClient;
  await expect(
    importSourceReports(db, "2026casnf", [
      row,
      { ...row, uuid: randomUUID(), sourceTeamNumber: 1967 },
    ]),
  ).rejects.toThrow("identity");
  await expect(
    importSourceReports(db, "2026casnf", [row, row]),
  ).rejects.toThrow("identity");
});
