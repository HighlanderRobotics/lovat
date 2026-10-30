import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pr-reviewer",
    include: ["test/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
