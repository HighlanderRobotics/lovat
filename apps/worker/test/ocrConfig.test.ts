import { expect, test } from "bun:test";
import { ocrTournamentKeys } from "../src/ocr/config";
import { scanScoreboardTournament } from "../src/jobs/scoreboard-ocr";
test("limits an explicitly scoped run without accepting malformed or empty scope", () => {
  expect(ocrTournamentKeys("2026cacg,2026cacg")).toEqual(["2026cacg"]);
  for (const scope of ["", ",", "production", "2026cacg,2025cacg"])
    expect(() => ocrTournamentKeys(scope)).toThrow();
});
test("an out-of-scope event cannot reach database or video reads", async () => {
  const previous = process.env.OCR_TOURNAMENT_KEYS;
  process.env.OCR_TOURNAMENT_KEYS = "2026cacg";
  try {
    await scanScoreboardTournament("2026other", {
      db: {
        tournament: {
          findFirst: () => {
            throw Error("unexpected database read");
          },
        },
      } as any,
      tba: {} as any,
    });
  } finally {
    if (previous === undefined) delete process.env.OCR_TOURNAMENT_KEYS;
    else process.env.OCR_TOURNAMENT_KEYS = previous;
  }
});
