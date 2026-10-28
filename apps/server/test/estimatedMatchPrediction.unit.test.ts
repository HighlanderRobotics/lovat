import { describe, expect, it } from "vitest";
import { predictEstimatedScores } from "../src/handler/analysis/predictions/estimatedScoreProbability.js";

describe("combined estimate prediction", () => {
  it("handles deterministic wins, losses and ties without a zero-variance NaN", () => {
    expect(
      predictEstimatedScores([
        [10, 10],
        [10, 10],
        [10, 10],
        [1, 1],
        [1, 1],
        [1, 1],
      ]).redWinning,
    ).toBe(1);
    expect(
      predictEstimatedScores([
        [1, 1],
        [1, 1],
        [1, 1],
        [10, 10],
        [10, 10],
        [10, 10],
      ]).redWinning,
    ).toBe(0);
    expect(
      predictEstimatedScores(Array.from({ length: 6 }, () => [0, 0]))
        .redWinning,
    ).toBe(0.5);
  });
  it("uses score variance and preserves complementary alliance probabilities", () => {
    const a = [
      [10, 30],
      [10, 20],
      [10, 20],
      [10, 20],
      [10, 20],
      [10, 20],
    ];
    const p = predictEstimatedScores(a);
    const reverse = predictEstimatedScores([...a.slice(3), ...a.slice(0, 3)]);
    expect(p.redWinning).toBeGreaterThan(0.5);
    expect(p.redWinning).toBeLessThan(1);
    expect(p.redWinning + p.blueWinning).toBe(1);
    expect(reverse.redWinning).toBeCloseTo(p.blueWinning, 8);
  });
  it("requires two actual estimates for every team and rejects invalid scores", () => {
    for (const invalid of [[1], [NaN, 1], [Infinity, 1], [-1, 1]]) {
      expect(() =>
        predictEstimatedScores([
          invalid,
          ...Array.from({ length: 5 }, () => [1, 2]),
        ]),
      ).toThrow("not enough data");
    }
  });
});
