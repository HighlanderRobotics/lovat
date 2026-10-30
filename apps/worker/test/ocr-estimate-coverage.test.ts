import { test, expect } from "bun:test";
import {
  estimateCoverage,
  validateEvidence,
  validateEstimateEvidence,
} from "../src/ocr/evidence";
test("TBA estimation measures dense observed time while review retains its sample-count gate", () => {
  const samples = Array.from({ length: 82 }, (_, i) => ({
    time: i * 2,
    red: i,
    blue: 0,
    confidence: 95,
  }));
  expect(validateEvidence(samples)).toBe(false);
  expect(validateEstimateEvidence(samples)).toBe(true);
  expect(estimateCoverage(samples).denseSeconds).toBe(162);
  const low = structuredClone(samples);
  low[10]!.confidence = 84;
  expect(validateEstimateEvidence(low)).toBe(false);
  expect(validateEstimateEvidence([samples[0]!, samples.at(-1)!])).toBe(false);
});
test("a score correction is preserved for conservative estimation but cannot create a review flag", () => {
  const samples = Array.from({ length: 164 }, (_, i) => ({
    time: i,
    red: i < 80 ? i : i - 1,
    blue: 0,
    confidence: 95,
  }));
  samples[80]!.red = 78;
  expect(validateEvidence(samples)).toBe(false);
  expect(validateEstimateEvidence(samples)).toBe(true);
});
