import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "integration",
    include: ["test/**/*.integration.test.ts"],
    maxWorkers: 1,
    setupFiles: ["./test/blockOutboundHttp.ts"],
  },
});
