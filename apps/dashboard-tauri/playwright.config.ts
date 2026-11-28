import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:1430",
    viewport: { width: 393, height: 852 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tool/serve-design-build.mjs",
    url: "http://127.0.0.1:1430",
  reuseExistingServer: !process.env.CI,
  },
});
