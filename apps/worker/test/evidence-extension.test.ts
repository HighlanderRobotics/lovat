import { expect, test } from "bun:test";
import { assertEvidenceExtension } from "../src/ocr/evidence-extension";
const old = {
  layoutVersion: "synthetic",
  observations: [{ time: 1, red: 1, blue: 2, confidence: 95, redPoints: 3 }],
  channels: { red: [{ time: 1, count: 1, confidence: 95 }], blue: [] },
};
test("gap recovery may add observations while preserving accepted counters and identity", () => {
  const candidate = structuredClone(old);
  candidate.observations.push({
    time: 2,
    red: 4,
    blue: 2,
    confidence: 95,
    redPoints: 6,
  });
  expect(assertEvidenceExtension(old, candidate)).toEqual({
    addedPaired: 1,
    addedRed: 0,
    addedBlue: 0,
  });
});
test("gap recovery rejects dropped or changed readings, missing channels, low confidence and another layout", () => {
  for (const change of [
    (c: typeof old) => {
      c.observations = [];
    },
    (c: typeof old) => {
      c.observations[0]!.red++;
    },
    (c: typeof old) => {
      c.observations[0]!.redPoints++;
    },
    (c: typeof old) => {
      c.channels.red = [];
    },
    (c: typeof old) => {
      c.channels.red[0]!.count++;
    },
    (c: typeof old) => {
      c.channels.red[0]!.confidence = 84;
    },
    (c: typeof old) => {
      c.layoutVersion = "other";
    },
  ]) {
    const candidate = structuredClone(old);
    change(candidate);
    expect(() => assertEvidenceExtension(old, candidate)).toThrow();
  }
});
