export function fixture() {
  const keys = ["frc3", "frc1", "frc2"],
    blue = ["frc6", "frc4", "frc5"];
  const b = (auto: number, tele: number, foul: number) => ({
    hubScore: {
      autoCount: auto,
      autoPoints: auto,
      teleopCount: tele,
      teleopPoints: tele,
      totalCount: auto + tele,
      totalPoints: auto + tele,
      endgameCount: tele,
      endgamePoints: tele,
    },
    autoTowerPoints: 0,
    endGameTowerPoints: 0,
    totalTowerPoints: 0,
    totalAutoPoints: auto,
    totalTeleopPoints: tele,
    totalPoints: auto + tele + foul,
    foulPoints: foul,
    minorFoulCount: 0,
    majorFoulCount: 0,
    autoTowerRobot1: "None",
    autoTowerRobot2: "None",
    autoTowerRobot3: "None",
    endGameTowerRobot1: "None",
    endGameTowerRobot2: "None",
    endGameTowerRobot3: "None",
  });
  const red = b(4, 6, 5),
    bb = b(0, 0, 0);
  const cycle = (
    team: number,
    id: string,
    start: number,
    end: number,
    q: number,
  ) => ({
    uuid: id,
    teamNumber: team,
    alliance: team <= 3 ? "RED" : "BLUE",
    sourceTeamNumber: 8033,
    events: [
      {
        eventUuid: id + "s",
        time: start,
        action: "START_SCORING",
        quantity: 0,
      },
      { eventUuid: id + "e", time: end, action: "STOP_SCORING", quantity: q },
    ],
  });
  return {
    matchKey: "2026test_qm1",
    slots: [
      ...keys.map((k, i) => ({
        teamNumber: Number(k.slice(3)),
        alliance: "RED",
        station: i + 1,
      })),
      ...blue.map((k, i) => ({
        teamNumber: Number(k.slice(3)),
        alliance: "BLUE",
        station: i + 1,
      })),
    ],
    reports: [cycle(1, "auto", 17, 21, 4), cycle(2, "tele", 24, 29, 6)],
    ocr: {
      matchKey: "2026test_qm1",
      status: "PARTIAL",
      observations: [
        { time: 0, red: 0, blue: 0, confidence: 95 },
        { time: 19, red: 0, blue: 0, confidence: 95 },
        { time: 24, red: 6, blue: 0, confidence: 95 },
        { time: 30, red: 10, blue: 0, confidence: 95 },
        { time: 163, red: 10, blue: 0, confidence: 95 },
      ],
    },
    tba: {
      key: "2026test_qm1",
      alliances: {
        red: { team_keys: keys, score: 15 },
        blue: { team_keys: blue, score: 0 },
      },
      score_breakdown: { red, blue: bb },
    },
  };
}
