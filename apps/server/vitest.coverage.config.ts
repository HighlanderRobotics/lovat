import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./vitest.config.ts", "./vitest.integration.config.ts"],
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/seed.ts"],
      reporter: ["text", "html", "json-summary", "json", "lcov"],
      thresholds: {
        // Keep untouched modules in the global denominator. Raise these floors
        // as coverage expands into schedules, onboarding, and external imports.
        lines: 49,
        statements: 49,
        functions: 42,
        branches: 82,
        "src/lib/middleware/requireAuth.ts": { 100: true },
        "src/lib/middleware/requireVerifiedTeam.ts": { 100: true },
        "src/handler/analysis/analysisFunction.ts": { 100: true },
        "src/handler/analysis/coreAnalysis/averageManyFast.ts": {
          lines: 95,
          statements: 95,
          functions: 80,
          branches: 85,
        },
        "src/handler/analysis/coreAnalysis/arrayAndAverageTeams.ts": {
          lines: 95,
          statements: 95,
          functions: 90,
          branches: 75,
        },
        "src/handler/analysis/coreAnalysis/averageAllTeamFast.ts": {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 80,
        },
        "src/handler/analysis/coreAnalysis/nonEventMetric.ts": {
          lines: 90,
          statements: 90,
          functions: 100,
          branches: 75,
        },
      },
    },
  },
});
