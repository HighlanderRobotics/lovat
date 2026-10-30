import { expect, test } from "bun:test";
import { scoutReportPoints, averageScoutPoints } from "../src/ocr/scout-score";
test("scout baseline applies accuracy and reported climbs, excluding invalidated events", () => {
  expect(
    scoutReportPoints({
      accuracy: 4,
      autoClimb: "SUCCEEDED",
      endgameClimb: "L2",
      events: [
        { action: "STOP_SCORING", points: 100, analysisExcluded: false },
        { action: "STOP_SCORING", points: 200, analysisExcluded: true },
        { action: "STOP_FEEDING", points: 500, analysisExcluded: false },
      ],
    }),
  ).toBe(120);
  expect(
    scoutReportPoints({
      accuracy: null,
      autoClimb: "NOT_ATTEMPTED",
      endgameClimb: "FAILED",
      events: [],
    }),
  ).toBe(0);
});
test("baseline scope and exclusion match estimates, without averaging partial metadata", () => {
  const reports = [
    {
      teamNumber: 1,
      sourceTeamNumber: 1967,
      analysisExcluded: false,
      scoutPoints: 10,
    },
    {
      teamNumber: 1,
      sourceTeamNumber: 8033,
      analysisExcluded: false,
      scoutPoints: 30,
    },
    {
      teamNumber: 1,
      sourceTeamNumber: 1967,
      analysisExcluded: true,
      scoutPoints: 900,
    },
    {
      teamNumber: 2,
      sourceTeamNumber: 1967,
      analysisExcluded: false,
      scoutPoints: 900,
    },
  ];
  expect(averageScoutPoints(reports, 1, [1967, 8033])).toBe(20);
  expect(averageScoutPoints(reports, 1, [1967])).toBe(10);
  expect(averageScoutPoints(reports, 3, [1967])).toBeNull();
  expect(
    averageScoutPoints(
      [
        ...reports,
        { teamNumber: 1, sourceTeamNumber: 1967, analysisExcluded: false },
      ],
      1,
      [1967],
    ),
  ).toBeNull();
});
