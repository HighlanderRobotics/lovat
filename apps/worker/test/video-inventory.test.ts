import { expect, test } from "bun:test";
import { qualificationVideoInventory } from "../src/ocr/video-inventory";

test("qualification inventory retains missing uploads in the denominator beyond the first 37 matches", () => {
  const matches = Array.from({ length: 59 }, (_, i) => ({ key: `2026cacg_qm${i + 1}`,
    comp_level: "qm", match_number: i + 1, videos: i < 57 ? [{ type: "youtube", key: String(i).padStart(11, "0") }] : [] }));
  const result = qualificationVideoInventory("2026cacg", matches);
  expect(result.qualificationMatches).toBe(59);
  expect(result.withVideo).toBe(57);
  expect(result.missingVideos).toEqual(["2026cacg_qm58", "2026cacg_qm59"]);
  expect(qualificationVideoInventory("2026cacg", matches, [{ id: "00000000048", title: null }]).matches[48]!.uploaderMetadataMissing).toBe(true);
  const fallback = qualificationVideoInventory("2026cacg", matches, [
    { id: "AAAAAAAAAAA", title: "Qualification 58 - CalGames 2026" },
    { id: "BBBBBBBBBBB", title: "Qualification 59 - CalGames 2025" },
    { id: "../unsafe", title: "Qualification 59 - CalGames 2026" },
  ]);
  expect(fallback.withVideo).toBe(58);
  expect(fallback.matches[57]!.videos).toEqual([{ key: "AAAAAAAAAAA", source: "UPLOADER_TITLE_CANDIDATE" }]);
  expect(fallback.missingVideos).toEqual(["2026cacg_qm59"]);
  expect(() => qualificationVideoInventory("2026cacg", [...matches, matches[0]])).toThrow("duplicate");
  expect(() => qualificationVideoInventory("2026other", matches)).toThrow("identity mismatch");
});
