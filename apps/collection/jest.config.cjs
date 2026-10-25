module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^uuid$": require.resolve("uuid"),
    "^zeego/(dropdown-menu|context-menu)$": "<rootDir>/test/mocks/menu.tsx",
  },
  testMatch: ["<rootDir>/test/**/*.spec.[jt]s?(x)"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "assets/**/*.{ts,tsx}",
    "plugins/**/*.cjs",
    "!**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "html", "json", "json-summary", "lcov"],
  coverageThreshold: {
    global: { lines: 100, branches: 100, statements: 100, functions: 100 },
  },
  maxWorkers: 1,
  clearMocks: true,
};
