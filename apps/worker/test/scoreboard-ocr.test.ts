import { describe, expect, test } from "bun:test";
import {
  findImpossibleClaims,
  validateObservations,
  type Observation,
} from "../src/ocr/evidence";
import { parseTsv, templateSchema, fuelCount } from "../src/ocr/media";
import { scanScoreboardTournament } from "../src/jobs/scoreboard-ocr";
const samples = (): Observation[] =>
  Array.from({ length: 164 }, (_, time) => ({
    time,
    red: time,
    blue: time * 2,
    confidence: 95,
  }));
const claim = { eventUuid: "event", start: 30, end: 40, quantity: 60 };
describe("scoreboard evidence", () => {
  test("only proposes a strike above the entire alliance upper bound", () => {
    expect(findImpossibleClaims(samples(), "RED", [claim])[0]).toMatchObject({
      allianceFuel: 18,
      allowance: 5,
    });
    expect(
      findImpossibleClaims(samples(), "RED", [{ ...claim, quantity: 23 }]),
    ).toEqual([]);
    expect(
      findImpossibleClaims(samples(), "BLUE", [{ ...claim, quantity: 40 }]),
    ).toEqual([]);
  });
  test("does not attribute simultaneous shots using guessed robot proportions", () => {
    expect(
      findImpossibleClaims(samples(), "RED", [
        { ...claim, quantity: 15 },
        { ...claim, eventUuid: "another", quantity: 15 },
      ]),
    ).toEqual([]);
  });
  test("declines early, late, missing, low-confidence, corrected, and gapped evidence", () => {
    for (const rows of [
      [],
      samples().filter((x) => x.time !== 28 && x.time !== 29 && x.time !== 30),
      samples().map((x) => ({ ...x, confidence: 50 })),
      samples().map((x) => (x.time === 32 ? { ...x, red: 0 } : x)),
    ])
      expect(findImpossibleClaims(rows, "RED", [claim])).toEqual([]);
    expect(
      findImpossibleClaims(samples(), "RED", [
        { ...claim, start: 0 },
        { ...claim, end: 163 },
      ]),
    ).toEqual([]);
  });
  test("validates complete monotonic fuel and clock observations", () => {
    expect(validateObservations(samples())).toBe(true);
    for (const rows of [
      [],
      samples().slice(10),
      samples().slice(0, 100),
      samples().map((x) => ({ ...x, red: NaN })),
      samples().map((x) => ({ ...x, confidence: 80 })),
      samples().map((x) => (x.time === 30 ? { ...x, time: 20 } : x)),
      samples().map((x) => ({ ...x, blue: -1 })),
    ])
      expect(validateObservations(rows)).toBe(false);
  });
  test("reads Tesseract word confidence without trusting an average", () => {
    expect(
      parseTsv(
        "level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t95\t118\n5\t1\t1\t1\t1\t2\t0\t0\t1\t1\t80\t8033",
      ),
    ).toEqual({ text: "118 8033", confidence: 80 });
    expect(parseTsv("header")).toEqual({ text: "", confidence: 0 });
  });
  test("rejects crops outside the image and unsupported seasons", () => {
    const layout = {
      version: "test",
      season: 2026,
      redFuel: [0, 0, 0.1, 0.1],
      blueFuel: [0, 0, 0.1, 0.1],
      clock: [0, 0, 0.1, 0.1],
      identity: [0, 0, 1, 1],
    };
    expect(templateSchema.safeParse(layout).success).toBe(true);
    expect(templateSchema.safeParse({ ...layout, season: 2025 }).success).toBe(
      false,
    );
    expect(
      templateSchema.safeParse({ ...layout, redFuel: [0.9, 0, 0.2, 0.1] })
        .success,
    ).toBe(false);
  });
  test("never downloads video for a tournament outside 8033 coverage", async () => {
    let requested = false;
    await scanScoreboardTournament("2026other", {
      db: { tournament: { findFirst: async () => null } } as any,
      tba: {
        get: async () => {
          requested = true;
          throw Error("unexpected");
        },
      } as any,
    });
    expect(requested).toBe(false);
  });
});

test("reads a fuel numerator without confusing the target or points counter", () => {
  expect(fuelCount("264 / 360")).toBe(264);
  expect(fuelCount("0")).toBe(0);
  expect(Number.isNaN(fuelCount("1O0"))).toBe(true);
  expect(Number.isNaN(fuelCount("5 360"))).toBe(true);
});
