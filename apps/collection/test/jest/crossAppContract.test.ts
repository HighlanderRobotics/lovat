import { expect, jest, test } from "@jest/globals";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendReport } from "../../lib/lovatAPI/collectionRequests";
import {
  scoutReportSchema,
  type ScoutReport,
} from "../../lib/collection/ScoutReport";
import { migrateScoutReport } from "../../lib/storage/scoutReportMigrations";

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../docs/testing/fixtures/contract-v1.json"),
    "utf8",
  ),
);

test("retained current payload is serialized unchanged for Server consumption", async () => {
  const bodies: Record<string, unknown> = {};
  for (const key of ["current", "secondRobot", "otherSource", "legacy"]) {
    const report = scoutReportSchema.parse(fixture.reports[key]);
    const post = jest.fn(async (path: string, body: unknown) => {
      expect(path).toBe("/collection/scoutreports");
      bodies[key] = JSON.parse(JSON.stringify(body));
      return new Response("{}", { status: 200 });
    });
    await sendReport(post, report);
    expect(bodies[key]).toEqual(fixture.reports[key]);
  }
  if (process.env.LOVAT_CONTRACT_OUTPUT_DIR) {
    mkdirSync(process.env.LOVAT_CONTRACT_OUTPUT_DIR, { recursive: true });
    writeFileSync(
      resolve(
        process.env.LOVAT_CONTRACT_OUTPUT_DIR,
        "collection-payloads.json",
      ),
      JSON.stringify(bodies, null, 2),
    );
  }
});

test("the retained broken-undo fixture migrates idempotently without changing private notes", () => {
  const migrated = migrateScoutReport(fixture.reports.legacy as ScoutReport);
  expect(migrated).toEqual(fixture.expected.migratedLegacy);
  expect(migrateScoutReport(migrated)).toEqual(migrated);
});
