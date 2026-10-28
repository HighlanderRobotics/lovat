import { expect, test } from "bun:test";
import { prepareReview } from "../tools/prepare-blind-review";

const match = { matchKey: "2026cacg_qm7", split: "heldout", videoKey: "H6a-GdEEHvs",
  url: "https://www.youtube.com/watch?v=H6a-GdEEHvs",
  red: ["frc1967", "frc8033", "frc4990"], blue: ["frc253", "frc840", "frc4904"] };

test("blind review keeps unknown counts blank and hides split and predictions", () => {
  const result = prepareReview([match]);
  expect(result.review.matches[0]!.counts).toHaveLength(16);
  expect(result.review.matches[0]!.counts.every(row => row.scoredFuelMin === null && row.scoredFuelMax === null)).toBe(true);
  expect(result.review.matches[0]!.counts.filter(row => row.actor === "human-player")).toHaveLength(4);
  expect(result.html).not.toContain('"heldout"');
  expect(prepareReview([match]).manifest.sha256).toBe(result.manifest.sha256);
  expect(() => prepareReview([{ ...match, prediction: 34 }])).toThrow();
  expect(() => prepareReview([{ ...match, red: match.blue }])).toThrow();
  expect(() => prepareReview([{ ...match, url: "https://example.com" }])).toThrow();
  expect(() => prepareReview([match, match])).toThrow();
});
