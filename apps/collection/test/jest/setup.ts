import { afterEach, beforeEach, jest } from "@jest/globals";
import { cleanup } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "26.1.0", ios: { buildNumber: "1" } } },
}));
jest.mock("uuid", () => ({ v4: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("../../lib/components/Icon", () => ({ Icon: () => null }));

const originalFetch = global.fetch;
beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn<typeof fetch>(() => {
    throw new Error(
      "Unexpected outbound request; install an explicit test stub",
    );
  });
});
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
  global.fetch = originalFetch;
});
