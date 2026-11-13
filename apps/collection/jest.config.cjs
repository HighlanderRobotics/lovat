module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/test/jest/**/*.test.ts",
    "<rootDir>/test/jest/**/*.test.tsx",
  ],
  setupFilesAfterEnv: ["<rootDir>/test/jest/setup.ts"],
  // Jest transforms tests to CommonJS; map the package's real ESM entry explicitly.
  moduleNameMapper: {
    "^@highlanderrobotics/magnolia-tokens$":
      "<rootDir>/node_modules/@highlanderrobotics/magnolia-tokens/dist/index.js",
  },
  clearMocks: true,
  restoreMocks: true,
  coverageDirectory: "test-report/coverage",
  coverageReporters: ["text", "html", "lcov", "json-summary"],
  collectCoverageFrom: [
    "lib/collection/reportStateStore.ts",
    "lib/collection/qrPayload.ts",
    "lib/storage/scoutReportMigrations.ts",
    "lib/storage/historyStore.ts",
    "lib/lovatAPI/collectionRequests.ts",
    "lib/collection/ui/GameTimer.tsx",
    "lib/components/Button.tsx",
    "app/game/submit.tsx",
  ],
  coverageThreshold: {
    global: { lines: 85, statements: 85, branches: 70, functions: 90 },
  },
  reporters: [
    "default",
    ["jest-junit", { outputDirectory: "test-report", outputName: "junit.xml" }],
  ],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|@highlanderrobotics/.*|expo(nent)?|@expo(nent)?/.*|expo-router|@react-navigation/.*|react-native-svg|react-native-safe-area-context|uuid|jotai|zustand))",
  ],
};
