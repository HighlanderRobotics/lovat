import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./vitest.config.ts", "./vitest.integration.config.ts"],
    maxWorkers: 1,
    reporters: ["default", "html"],
    outputFile: { html: "test-report/index.html" },
    coverage: {
      provider: "v8",
      reportsDirectory: "test-report/coverage",
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json-summary", "json", "lcov"],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
        perFile: true,
      },
    },
  },
});
