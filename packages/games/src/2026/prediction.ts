import type { AnalysisResponse } from "@lovat/api";
import { normalPrediction } from "../prediction.js";
import { rules2026 } from "./rules.js";
type Team = AnalysisResponse["teams"][string];
const series = (team: Team) =>
  (team.timeline ?? []).flatMap((point) =>
    typeof point.metrics.totalPoints?.value === "number"
      ? [point.metrics.totalPoints.value]
      : [],
  );
const average = (teams: readonly Team[]) =>
  teams.reduce(
    (sum, team) =>
      sum +
      (typeof team.metrics.totalPoints?.value === "number"
        ? team.metrics.totalPoints.value
        : 0),
    0,
  );
export const rankingPoints2026 = (
  score: number,
  outcome: "win" | "loss" | "tie",
) =>
  (outcome === "win"
    ? rules2026.ranking.win
    : outcome === "tie"
      ? rules2026.ranking.tie
      : 0) +
  rules2026.ranking.scoreBonusThresholds.filter(
    (threshold) => score >= threshold,
  ).length;
export const prediction2026 = {
  metrics: ["totalPoints"],
  calculate({ red, blue }: { red: readonly Team[]; blue: readonly Team[] }) {
    const odds = normalPrediction(
      [...red, ...blue].map(series),
      rules2026.allianceSize,
    );
    const redScore = average(red),
      blueScore = average(blue);
    const winner =
      odds.redWinning === odds.blueWinning
        ? "tie"
        : odds.winningAlliance === 0
          ? "red"
          : "blue";
    return {
      ...odds,
      winningAlliance: winner as "red" | "blue" | "tie",
      redScore,
      blueScore,
      redRankingPoints: rankingPoints2026(
        redScore,
        winner === "tie" ? "tie" : winner === "red" ? "win" : "loss",
      ),
      blueRankingPoints: rankingPoints2026(
        blueScore,
        winner === "tie" ? "tie" : winner === "blue" ? "win" : "loss",
      ),
    };
  },
};
