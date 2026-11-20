import { z } from "zod";
import {
  defineGame,
  MetricRegistry,
  defineMetricFor,
  mean,
  GameError,
} from "../dist/index.js";
const glyphRules = {
  high: 7,
  low: 2,
  balance: 13,
  winRP: 2,
  bonusThreshold: 20,
  maxPlausibleScore: 1000,
};
const glyphPeriods = [
  { id: "setup", label: "Setup", durationSeconds: 15 },
  { id: "play", label: "Play", durationSeconds: 60 },
];
const glyphScore = (data) =>
  data.throws.reduce(
    (n, entry) =>
      n +
      entry.count * (entry.zone === "high" ? glyphRules.high : glyphRules.low),
    0,
  ) + (data.balanced ? glyphRules.balance : 0);
const metric = defineMetricFor();
const metadata = (id, kind = "number") => ({
  id,
  aliases: id === "glyphScore" ? ["points"] : [],
  season: 2099,
  version: 1,
  label: id,
  unit: "points",
  kind,
  precision: 2,
  missing: "exclude",
  dependencies: [],
  requires: ["throws", "balanced"],
});
const schema = z
  .object({
    throws: z
      .array(
        z.object({
          zone: z.enum(["high", "low"]),
          count: z.number().int().nonnegative(),
        }),
      )
      .max(50),
    balanced: z.boolean(),
  })
  .strict();
const old = z
  .object({
    high: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    balanced: z.boolean(),
  })
  .strict();
export const fictionalGame = defineGame({
  id: "fixture-glyphs",
  season: 2099,
  version: 1,
  label: "Fictional test game",
  report: { version: 2, schema },
  olderReports: [
    {
      version: 1,
      schema: old,
      upgrade: (value) => ({
        throws: [
          { zone: "high", count: value.high },
          { zone: "low", count: value.low },
        ],
        balanced: value.balanced,
      }),
    },
  ],
  rules: { allianceSize: 2, periods: glyphPeriods, scoring: glyphRules },
  check: (_data, context) => {
    if (
      context.endTime - context.startTime >
      (glyphPeriods.reduce((n, p) => n + p.durationSeconds, 0) + 1) * 1000
    )
      throw new GameError(
        400,
        "INVALID_GAME_TIMING",
        "Report exceeds this game's clock",
      );
  },
  assess: (data, officialScore) =>
    glyphScore(data) <=
    Math.min(glyphRules.maxPlausibleScore, officialScore ?? Infinity),
  prediction: {
    metrics: ["glyphScore", "capability"],
    calculate({ red, blue }) {
      const score = (teams) =>
        teams.reduce(
          (sum, team) =>
            sum +
            (typeof team.metrics.glyphScore?.value === "number"
              ? team.metrics.glyphScore.value
              : 0),
          0,
        );
      const redScore = score(red),
        blueScore = score(blue),
        redWinning =
          redScore === blueScore ? 0.5 : redScore > blueScore ? 1 : 0;
      return {
        redScore,
        blueScore,
        redWinning,
        blueWinning: 1 - redWinning,
        winningAlliance:
          redWinning === 0.5 ? "tie" : redWinning === 1 ? "red" : "blue",
        redRankingPoints:
          (redWinning === 1 ? glyphRules.winRP : redWinning === 0.5 ? 1 : 0) +
          (redScore >= glyphRules.bonusThreshold ? 1 : 0),
        blueRankingPoints:
          (redWinning === 0 ? glyphRules.winRP : redWinning === 0.5 ? 1 : 0) +
          (blueScore >= glyphRules.bonusThreshold ? 1 : 0),
      };
    },
  },
  prepare: ({ data }) => ({
    score: glyphScore(data),
    balanced: data.balanced,
    attempts: data.throws.reduce((n, entry) => n + entry.count, 0),
  }),
  metrics: new MetricRegistry([
    metric({
      metadata: metadata("glyphScore"),
      output: z.number(),
      calculate: (facts) => facts.score,
      reports: mean,
      aggregate: mean,
    }),
    metric({
      metadata: metadata("capability", "structured"),
      output: z.object({ canBalance: z.boolean(), capacity: z.number() }),
      calculate: (facts) => ({
        canBalance: facts.balanced,
        capacity: facts.attempts,
      }),
      reports: (values) => ({
        canBalance: values.some((v) => v.canBalance),
        capacity: Math.max(...values.map((v) => v.capacity)),
      }),
      aggregate: (values) => ({
        canBalance: values.some((v) => v.canBalance),
        capacity: Math.max(...values.map((v) => v.capacity)),
      }),
    }),
  ]),
});
