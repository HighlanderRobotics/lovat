import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.unit.test.ts"],
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/seed.ts"],
    },
  },
});
