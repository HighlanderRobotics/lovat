import { expect, test } from "bun:test";
import { eventMatchLabel } from "../src/ocr/match-label";
test("2026 broadcast labels distinguish qualifications, playoff rounds and finals", () => {
  expect(
    eventMatchLabel(
      { competitionLevel: "QUALIFICATION", setNumber: 1, matchNumber: 19 },
      10,
    ),
  ).toBe("Qualification 19");
  for (const playoffType of [10, 11]) {
    expect(
      eventMatchLabel(
        { competitionLevel: "SEMIFINAL", setNumber: 4, matchNumber: 1 },
        playoffType,
      ),
    ).toBe("Playoff 4");
    expect(
      eventMatchLabel(
        { competitionLevel: "FINAL", setNumber: 1, matchNumber: 2 },
        playoffType,
      ),
    ).toBe("Final 2");
  }
  expect(
    eventMatchLabel(
      { competitionLevel: "QUARTERFINAL", setNumber: 2, matchNumber: 1 },
      null,
    ),
  ).toBe("QUARTERFINAL 2 1");
});
