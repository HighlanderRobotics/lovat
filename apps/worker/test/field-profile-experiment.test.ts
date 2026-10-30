import { expect, test } from "bun:test";
import { selectFieldProfiles } from "../src/ocr/field-profile-experiment";

function fixture() {
  const labels = ["train", "test"].map((split, i) => ({
    id: `2026test_qm${i + 1}-v16`, split, sourceRgbSha256: (i ? "b" : "a").repeat(64),
    values: { clock: 12, redFuel: 12, redPoints: 12 },
  }));
  const measurements: any[] = [];
  for (const label of labels) for (const [fieldId, field] of [["clock", "clock"], ["redFuel", "fuel"], ["redPoints", "points"]])
    for (const round of [1, 2]) for (const scale of [2, 3, 4]) for (const psm of [7, 8, 13])
      for (const [padding, stage] of [[0, "primary"], [10, "primary"], [20, "primary"], [10, "normalizedGray"], [10, "binary"]])
        measurements.push({ caseId: label.id, fieldId, sourceRgbSha256: label.sourceRgbSha256,
          field, round, scale, psm, padding, stage, confidentSyntax: true,
          parsedValue: scale === 2 || (scale === 3 && label.split === "test") ? 111 : 12,
          elapsedMicros: scale + Number(padding) / 10 });
  return { grid: { runtime: { tesseractVersion: "test", language: "eng", modelSha256: "c".repeat(64) }, measurements }, references: { labels } };
}

test("field selection rejects fast false accepts and never uses held-out values for ranking", () => {
  const { grid, references } = fixture();
  const result = selectFieldProfiles(grid, references);
  expect(result.promoted).toBe(false);
  for (const field of result.results) {
    expect(field.selected.profile).toEqual({ scale: 3, psm: 7, padding: 0 });
    expect(field.selected.fitting.correct).toBe(1);
    expect(field.selected.test.falseAccepts).toBe(1);
    expect(field.baseline.test.correct).toBe(1);
  }
  references.labels[1]!.values = { clock: 111, redFuel: 111, redPoints: 111 };
  const changed = selectFieldProfiles(grid, references);
  expect(changed.results.map(f => f.selected.profile)).toEqual(result.results.map(f => f.selected.profile));
});

test("field experiments reject duplicated measurements, pixel mismatches and match leakage", () => {
  const { grid, references } = fixture();
  const duplicate = structuredClone(grid); duplicate.measurements.push(duplicate.measurements[0]!);
  expect(() => selectFieldProfiles(duplicate, references)).toThrow("duplicate");
  const wrong = structuredClone(references); wrong.labels[0]!.sourceRgbSha256 = "d".repeat(64);
  expect(() => selectFieldProfiles(grid, wrong)).toThrow("identity mismatch");
  const leaked = structuredClone(references); leaked.labels.push({ ...leaked.labels[0]!, id: "2026test_qm1-v40", split: "test" });
  expect(() => selectFieldProfiles(grid, leaked)).toThrow("leak across");
  const incomplete = structuredClone(grid); incomplete.measurements.pop();
  expect(() => selectFieldProfiles(incomplete, references)).toThrow("Incomplete");
});
