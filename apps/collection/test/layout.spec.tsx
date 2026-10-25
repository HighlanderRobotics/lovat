import React from "react";
import { AppState, NativeModules } from "react-native";
import { act, render } from "@testing-library/react-native";
import { useFonts } from "expo-font";
import { SplashScreen } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Layout from "../app/_layout";
import {
  monitorConnectivity,
  refreshConnectivity,
} from "../lib/network/connectivity";
import {
  useStartMatchEnabledStore,
  useTeamStore,
  useTournamentStore,
} from "../lib/storage/userStores";
import { useTournamentsStore } from "../lib/services";
import { tournament } from "./fixtures";

jest.mock("expo-font", () => ({ useFonts: jest.fn(() => [true, null]) }));
jest.mock("../lib/services", () => ({
  ...jest.requireActual("../lib/services"),
  getServiceLoader: jest.fn(() => jest.fn(async () => {})),
}));
jest.mock("../lib/network/connectivity", () => ({
  ...jest.requireActual("../lib/network/connectivity"),
  monitorConnectivity: jest.fn(() => jest.fn()),
  refreshConnectivity: jest.fn(async () => ({})),
}));
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
  jest.mocked(useFonts).mockReturnValue([true, null]);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
test("startup loads fonts, refreshes foreground data and releases subscriptions and timers", async () => {
  const events = jest.spyOn(AppState, "addEventListener");
  const view = render(<Layout />);
  expect(monitorConnectivity).toHaveBeenCalled();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(useStartMatchEnabledStore.getState().value).toBe(true);
  await act(async () => {
    events.mock.calls[0][1]("background");
    events.mock.calls[0][1]("active");
  });
  expect(refreshConnectivity).toHaveBeenCalledTimes(1);
  jest.mocked(refreshConnectivity).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => {
    events.mock.calls[0][1]("active");
  });
  await act(async () => {
    useTeamStore.getState().setCode("changed");
  });
  await act(async () => {
    jest.advanceTimersByTime(120000);
  });
  view.unmount();
});
it.each([
  [false, null],
  [false, new Error("Font missing")],
] as const)(
  "font readiness %s/%s has a safe splash fallback",
  async (loaded, error) => {
    jest.mocked(useFonts).mockReturnValue([loaded, error]);
    const view = render(<Layout />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
    if (!error) expect(view.toJSON()).toBeNull();
  },
);
it.each([
  { tournaments: null },
  { tournaments: [] },
  { tournaments: [tournament] },
])(
  "legacy storage migrates once with tournament result $tournaments",
  async ({ tournaments }) => {
    const fetch = jest
      .spyOn(useTournamentsStore.getState(), "fetchData")
      .mockImplementation(async () => {
        useTournamentsStore.setState({ data: tournaments });
      });
    const data: Record<string, string> = {
      "onboarding-complete": "true",
      "team-number": "8033",
      "team-code": "synthetic-code",
      scouter: JSON.stringify({ uuid: "scout", name: "Alex" }),
      tournament: tournament.key,
      trainingMode: "false",
      qrCodeSize: "450",
      fieldOrientation: "0",
      history: "[]",
    };
    await AsyncStorage.multiSet(Object.entries(data));
    render(<Layout />);
    await act(async () => {});
    expect(useTeamStore.getState().code).toBe("synthetic-code");
    expect(useTeamStore.getState().number).toBe(8033);
    expect(await AsyncStorage.getItem("team-code")).toBeNull();
    if (tournaments?.length)
      expect(useTournamentStore.getState().value).toEqual(tournament);
    fetch.mockRestore();
  },
);

test("Android startup enables the available layout animation bridge", () => {
  const enable = jest.fn();
  jest.isolateModules(() => {
    jest.doMock("react-native", () =>
      Object.create(jest.requireActual("react-native"), {
        NativeModules: {
          value: {
            ...NativeModules,
            UIManager: { setLayoutAnimationEnabledExperimental: enable },
          },
        },
      }),
    );
    // Import-time native setup must run once when the bridge is available.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../app/_layout");
  });
  expect(enable).toHaveBeenCalledWith(true);
  jest.dontMock("react-native");
});
