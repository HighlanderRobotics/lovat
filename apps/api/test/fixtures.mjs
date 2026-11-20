export const scope = {
  userId: "auth0|example",
  teamNumber: 8033,
  role: "ANALYST",
  sources: {
    teams: { mode: "INCLUDE", items: [8033] },
    tournaments: { mode: "EXCLUDE", items: [] },
  },
};
export function report(overrides = {}) {
  return {
    uuid: "report1",
    teamNumber: 8033,
    matchKey: "qm1",
    tournamentKey: "2026test",
    tournamentDate: "2026-03-01",
    events: [],
    driverAbility: 3,
    defenseEffectiveness: 2,
    accuracy: null,
    autoClimb: "NOT_ATTEMPTED",
    endgameClimb: "NOT_ATTEMPTED",
    robotRoles: ["CYCLING"],
    feederTypes: [],
    fieldTraversal: "TRENCH",
    beached: "NEITHER",
    scoresWhileMoving: false,
    disrupts: false,
    intakeType: "GROUND",
    ...overrides,
  };
}
export function event(action, time, quantity = null) {
  return { action, time, quantity, points: quantity ?? 0, position: "NONE" };
}
