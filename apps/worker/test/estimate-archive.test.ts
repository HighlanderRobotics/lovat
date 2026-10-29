import { expect, test } from "bun:test";
import { buildEstimateArchive } from "../src/ocr/estimate-archive";
import { fixture } from "./fixtures/official-fusion";
test("archive export recomputes deterministic source scopes rather than accepting supplied scores", () => {
  const input = fixture();
  const first = buildEstimateArchive([input], [8033, 1967]);
  const changed = {
    ...input,
    reports: [...input.reports].reverse(),
    estimatedPoints: 99999,
  };
  const second = buildEstimateArchive([changed], [1967, 8033]);
  expect(first.sql).toBe(second.sql);
  expect(first.verificationSql).toBe(second.verificationSql);
  expect(first.manifest).toMatchObject({
    matches: 1,
    teamMatches: 6,
    rows: 18,
    inputOrigin: "ARCHIVE",
  });
  expect(first.sql).toContain("pg_advisory_xact_lock");
  expect(first.sql).toContain("verified.reports <> 0");
  expect(first.sql).toContain(
    'WHERE "EstimatedScore"."inputOrigin"=\'ARCHIVE\'',
  );
});
test("archive export rejects duplicate identities, unsupported official input and invalid scopes", () => {
  const input = fixture();
  expect(() => buildEstimateArchive([input, input], [8033])).toThrow(
    "Duplicate archive match",
  );
  expect(() =>
    buildEstimateArchive([{ ...input, tba: undefined }], [8033]),
  ).toThrow();
  for (const sources of [[], [0], [NaN], [2147483648]])
    expect(() => buildEstimateArchive([input], sources)).toThrow("scope");
});

test("baseline mode changes only comparison metadata and guards the original estimates", () => {
  const result = buildEstimateArchive([fixture()], [8033], "baselines");
  expect(result.sql).not.toContain('INSERT INTO "EstimatedScore"');
  expect(result.sql).toContain('SET "scoutPoints"=');
  expect(result.sql).toContain('e."inputSha256" IS DISTINCT FROM');
  expect(result.sql).toContain('e."totalPoints" IS DISTINCT FROM');
  expect(result.manifest.mode).toBe("baselines");
});
