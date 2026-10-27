import type { fuseOfficialMatch } from "./fusion-official";

type Estimate = ReturnType<typeof fuseOfficialMatch>;
export function contributionTables(estimates: Estimate[]) {
  const teams: Record<string, string | number>[] = [];
  const alliances: Record<string, string | number>[] = [];
  const seen = new Set<string>();
  for (const estimate of estimates) {
    if (seen.has(estimate.matchKey)) throw new Error("Duplicate export match");
    seen.add(estimate.matchKey);
    for (const alliance of estimate.alliances) {
      const attributedPoints = alliance.teams.reduce(
        (sum, team) => sum + team.estimatedPoints,
        0,
      );
      const attributedFuel = alliance.teams.reduce(
        (sum, team) => sum + team.estimatedFuel,
        0,
      );
      if (
        !alliance.pointsConserved ||
        attributedPoints + alliance.unattributedPoints + alliance.foulPoints !==
          alliance.officialPoints ||
        attributedFuel + alliance.unattributedFuel !== alliance.officialFuel
      )
        throw new Error("Export totals do not conserve the official result");
      for (const team of alliance.teams) {
        const evidence = alliance.attributionEvidence.map((phase) => ({
          phase: phase.phase,
          support: phase.robots.find(
            (robot) => robot.teamNumber === team.teamNumber,
          )!,
        }));
        teams.push({
          matchKey: estimate.matchKey,
          alliance: alliance.alliance,
          teamNumber: team.teamNumber,
          autoFuel: team.autoFuelCount,
          autoFuelPoints: team.autoFuelPoints,
          autoTowerPoints: team.autoTowerPoints,
          autoPoints: team.autoPoints,
          teleopFuel: team.teleopFuelCount,
          teleopFuelPoints: team.teleopFuelPoints,
          endgameTowerPoints: team.endgameTowerPoints,
          teleopPoints: team.teleopPoints,
          totalFuel: team.estimatedFuel,
          totalRobotPoints: team.estimatedPoints,
          reports: team.reports,
          sourceTeams: team.sourceTeams.join(";"),
          attributionStatus: estimate.attributionStatus,
          autoConsensus:
            evidence[0]!.support.support / evidence[0]!.support.scale,
          teleopConsensus:
            evidence[1]!.support.support / evidence[1]!.support.scale,
          algorithm: estimate.algorithm,
        });
      }
      alliances.push({
        matchKey: estimate.matchKey,
        alliance: alliance.alliance,
        officialFuel: alliance.officialFuel,
        attributedFuel,
        unattributedFuel: alliance.unattributedFuel,
        officialPoints: alliance.officialPoints,
        attributedRobotPoints: attributedPoints,
        unattributedPoints: alliance.unattributedPoints,
        foulCredit: alliance.foulPoints,
        autoOfficialPoints: alliance.phases[0]!.officialPoints,
        autoUnattributedFuel: alliance.phases[0]!.unattributedFuel,
        teleopOfficialPoints: alliance.phases[1]!.officialPoints,
        teleopUnattributedFuel: alliance.phases[1]!.unattributedFuel,
        algorithm: estimate.algorithm,
      });
    }
  }
  return { teams, alliances };
}
export function contributionCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]!);
  const field = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  return (
    [
      columns.map(field).join(","),
      ...rows.map((row) =>
        columns.map((column) => field(row[column]!)).join(","),
      ),
    ].join("\n") + "\n"
  );
}
