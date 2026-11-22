import { normalizeTimeline } from "./timeline.js";
import { plausible2026 } from "./assess.js";
import { prediction2026 } from "./prediction.js";
import { gameData2026Schema, eventActions, eventPositions } from "@lovat/api";
import { defineGame } from "../pack.js";
import { season2026 } from "./metrics.js";
import { prepareFacts } from "./facts.js";
import { rules2026 } from "./rules.js";
export const game2026 = defineGame({
  id: "frc-2026",
  season: 2026,
  version: 1,
  label: "Lovat 2026",
  report: { version: 1, schema: gameData2026Schema },
  rules: {
    allianceSize: rules2026.allianceSize,
    periods: [...rules2026.periods],
    scoring: {
      autoClimbPoints: rules2026.autoClimbPoints,
      endgamePoints: rules2026.endgamePoints,
      accuracyPercent: [...rules2026.accuracyPercent],
      ranking: {
        ...rules2026.ranking,
        scoreBonusThresholds: [...rules2026.ranking.scoreBonusThresholds],
      },
      reportFlagThreshold: rules2026.reportFlagThreshold,
    },
  },
  metrics: season2026,
  prediction: prediction2026,
  assess: plausible2026,
  check: (data, context) => {
    normalizeTimeline(
      data,
      Math.min(
        (context.endTime - context.startTime) / 1000,
        rules2026.periods.reduce(
          (sum, period) => sum + period.durationSeconds,
          0,
        ),
      ),
    );
  },
  prepare(report) {
    const { data, ...identity } = report;
    return prepareFacts({
      ...identity,
      ...data,
      fieldTraversal: data.mobility,
      accuracy: data.accuracy ?? null,
      events: data.events.map(([time, action, position, quantity]) => ({
        time,
        action: eventActions[action],
        position: eventPositions[position],
        quantity: quantity ?? 0,
        points: eventActions[action] === "STOP_SCORING" ? (quantity ?? 0) : 0,
      })),
    });
  },
});

export * from "./facts.js";
export * from "./metrics.js";
export * from "./rules.js";

export * from "./adapter.js";

export * from "./prediction.js";

export * from "./timeline.js";
export * from "./assess.js";
