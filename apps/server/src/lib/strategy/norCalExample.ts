// This is a hypothetical REBUILT scenario, not an event-results import.
// Real identities: 8033 Highlander Robotics, 1323 MadTown Robotics, 4414 HighTide.
// All alliance assignments, observations and ratings below are invented fixtures.
export function norCalExample(): {
  isExample: boolean;
  scenarioNotice: string;
  tournament: { key: string; name: string };
  teamNumber: number;
  match: {
    key: string;
    competitionLevel: string;
    matchNumber: number;
    setNumber: number;
    scheduledTime: null;
    teamSlots: { teamNumber: number; alliance: string; station: number }[];
  };
  teams: {
    teamNumber: number;
    name: string;
    alliance: string;
    station: number;
    reports: {
      teamMatchKey: string;
      notes: string;
      driverAbility: number;
      defenseEffectiveness: number;
      actions: Record<string, never>;
    }[];
  }[];
  collectedAt: string;
} {
  const profiles = [
    {
      teamNumber: 8033,
      name: "Highlander Robotics",
      alliance: "RED",
      station: 1,
      driverAbility: 4,
      defenseEffectiveness: 4,
      observations: [
        "Sample: reliable short autonomous route. Driver prefers feeding and can play contact defense; scoring was less consistent than alliance partners.",
        "Sample: fed fuel successfully, recovered from traffic quickly, and completed an L2 climb. Needs a clear approach lane to the tower.",
        "Sample: defense delayed an opposing scorer, but prolonged defense left less time for its own climb. No observed robot breakdown.",
      ],
    },
    {
      teamNumber: 1323,
      name: "MadTown Robotics",
      alliance: "RED",
      station: 2,
      driverAbility: 5,
      defenseEffectiveness: 3,
      observations: [
        "Sample: strongest repeat scorer in this fictional alliance. Efficient cycles when supplied fuel and given open travel lanes.",
        "Sample: autonomous scoring route uses center-side fuel. Confirm route ownership before sharing the field with 4414.",
        "Sample: continued scoring under light defense; heavy traffic reduced its cycle efficiency. Completed an L3 climb.",
      ],
    },
    {
      teamNumber: 4414,
      name: "HighTide",
      alliance: "RED",
      station: 3,
      driverAbility: 5,
      defenseEffectiveness: 3,
      observations: [
        "Sample: accurate secondary scorer; autonomous route also reaches toward center-side fuel and could conflict with 1323.",
        "Sample: performed well from an alternate scoring lane when another scorer occupied the preferred lane.",
        "Sample: completed an L3 climb, but its approach crossed a partner's return path. Coordinate approach order before the match.",
      ],
    },
    {
      teamNumber: 254,
      name: "The Cheesy Poofs",
      alliance: "BLUE",
      station: 1,
      driverAbility: 5,
      defenseEffectiveness: 3,
      observations: [
        "Sample opponent: efficient scoring cycles; less efficient when forced into a longer return path.",
        "Sample opponent: center-side autonomous route. Avoid assuming it will repeat without drive-team confirmation.",
        "Sample opponent: recovered well from light contact; dedicated defense might cost more alliance scoring than it removes.",
      ],
    },
    {
      teamNumber: 1678,
      name: "Citrus Circuits",
      alliance: "BLUE",
      station: 2,
      driverAbility: 5,
      defenseEffectiveness: 4,
      observations: [
        "Sample opponent: effective scorer and feeder with flexible routing.",
        "Sample opponent: supplied its alliance partner when its own scoring lane was crowded.",
        "Sample opponent: successful climb; alliance approaches became congested late in the match.",
      ],
    },
    {
      teamNumber: 971,
      name: "Spartan Robotics",
      alliance: "BLUE",
      station: 3,
      driverAbility: 4,
      defenseEffectiveness: 4,
      observations: [
        "Sample opponent: played active contact defense on the highest-volume scorer.",
        "Sample opponent: switched between feeding and defense. Watch for pressure on 1323's return lane.",
        "Sample opponent: climb outcome unknown. Do not treat this missing observation as an inability to climb.",
      ],
    },
  ];
  const teams = profiles.map(
    ({ observations, driverAbility, defenseEffectiveness, ...team }) => ({
      ...team,
      reports: observations.map((notes, i) => ({
        teamMatchKey: `2026norcaldemo_qm${i + 1}_${team.teamNumber}`,
        notes: `SYNTHETIC TEST DATA — ${notes}`,
        driverAbility,
        defenseEffectiveness,
        actions: {},
      })),
    }),
  );
  return {
    isExample: true,
    scenarioNotice:
      "Hypothetical REBUILT match inspired by the 2026 FIRST California Northern State Championship. Not an official schedule, result, or claim about any robot's actual performance. Every report is synthetic test data.",
    tournament: {
      key: "2026norcaldemo",
      name: "NorCal Championship · REBUILT example",
    },
    teamNumber: 8033,
    match: {
      key: "2026norcaldemo_qm4",
      competitionLevel: "QUALIFICATION",
      matchNumber: 4,
      setNumber: 1,
      scheduledTime: null,
      teamSlots: teams.map(({ teamNumber, alliance, station }) => ({
        teamNumber,
        alliance,
        station,
      })),
    },
    teams,
    collectedAt: new Date().toISOString(),
  };
}
