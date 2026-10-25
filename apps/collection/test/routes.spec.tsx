import { useCustomPostMatchStore } from "../lib/storage/customPostMatchStore";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import Index from "../app/index";
import Welcome from "../app/onboarding/index";
import Settings from "../app/settings/index";
import Tournaments from "../app/settings/tournament";
import OnboardingTournaments from "../app/onboarding/tournaments";
import QRSize from "../app/settings/qrcode-size";
import Reset from "../app/settings/reset";
import {
  useOnboardingCompleteStore,
  useTournamentStore,
  useQrCodeSizeStore,
  useTeamStore,
  useScouterStore,
} from "../lib/storage/userStores";
import { useTournamentsStore } from "../lib/services";
import { useUrlPrefix } from "../lib/lovatAPI/lovatAPI";
import { getTournaments } from "../lib/lovatAPI/getTournaments";
import { scout, tournament } from "./fixtures";
import { Switch } from "react-native-gesture-handler";

jest.mock("../lib/lovatAPI/getTournaments", () => ({
  getTournaments: jest.fn(async () => []),
}));
jest.mock("../lib/lovatAPI/getTeamScouters", () => ({
  getTeamScouters: jest.fn(async () => []),
}));
jest.mock("../lib/lovatAPI/getScouterSchedule", () => ({
  getScouterSchedule: jest.fn(async () => undefined),
}));
jest.mock("../lib/lovatAPI/getMatchSchedule", () => ({
  getMatchSchedule: jest.fn(async () => ({
    tournamentKey: "2023test",
    matches: [],
  })),
}));
beforeEach(() => {
  jest
    .spyOn(useCustomPostMatchStore.getState(), "fetchData")
    .mockResolvedValue(undefined);
  useTeamStore.setState({ number: 8033, code: "test" });
  useScouterStore.getState().setValue(scout);
  useUrlPrefix.getState().setUrlPrefix("https://example.test");
  useTournamentStore.getState().setValue(tournament);
  useTournamentsStore.setState({
    data: [
      tournament,
      { ...tournament, key: "2023other", name: "Other event" },
    ],
  });
});
it.each([true, false, null])("index routes onboarding state %s", (value) => {
  useOnboardingCompleteStore.setState({ value: value as boolean });
  render(<Index />);
  expect(
    screen.getByText(
      value === null ? "Loading..." : value ? "/home" : "/onboarding",
    ),
  ).toBeTruthy();
});
test("welcome advances to the team code", () => {
  render(<Welcome />);
  fireEvent.press(screen.getByText("Begin"));
  expect(router.push).toHaveBeenCalledWith("/onboarding/team-code");
});
it.each([450, 600, 700])(
  "settings exposes QR size %s and configuration controls",
  async (size) => {
    useQrCodeSizeStore.getState().setValue(size);
    render(<Settings />);
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
    fireEvent.press(screen.getByText("Sinister"));
    fireEvent(screen.UNSAFE_getByType(Switch), "change", {
      nativeEvent: { value: true },
    });
    fireEvent.press(screen.getByText("Change"));
    expect(router.push).toHaveBeenCalledWith("/settings/tournament");
    fireEvent.press(screen.getByText("Reset"));
    fireEvent.press(screen.getByText("Reset all settings and data"));
    expect(router.push).toHaveBeenCalledWith("/settings/reset");
    act(() => {
      useTournamentStore.getState().setValue(null);
      useUrlPrefix.getState().setUrlPrefix(null);
    });
    expect(screen.toJSON()).toBeTruthy();
    await act(async () => {});
  },
);
test("tournament selection supports filtering, selecting and clearing the selected event", async () => {
  render(<Tournaments />);
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "other");
  expect(screen.queryByText("2023 Test Regional")).toBeNull();
  fireEvent.press(screen.getByText("2023 Other event"));
  expect(useTournamentStore.getState().value?.key).toBe("2023other");
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "");
  act(() => {
    useTournamentsStore.setState({ data: null });
  });
  expect(screen.queryByText("2023 Other event")).toBeNull();
  fireEvent.press(screen.getByLabelText("Back"));
  expect(router.back).toHaveBeenCalled();
  await act(async () => {});
});
test("onboarding event selection finishes onboarding", async () => {
  jest.mocked(getTournaments).mockResolvedValue([tournament]);
  render(<OnboardingTournaments />);
  await act(async () => {});
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "test");
  fireEvent.press(screen.getByText("2023 Test Regional"));
  expect(useOnboardingCompleteStore.getState().value).toBe(true);
  act(() => {
    useTournamentsStore.setState({ data: null });
  });
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "unknown");
  expect(screen.queryByText("2023 Test Regional")).toBeNull();
});

import Slider from "@react-native-community/slider";
import { useHistoryStore } from "../lib/storage/historyStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
test("QR settings preview the real report and persist a new chunk size", async () => {
  render(<QRSize />);
  fireEvent(screen.UNSAFE_getByType(Slider), "slidingComplete", 300);
  expect(useQrCodeSizeStore.getState().value).toBe(300);
  fireEvent.press(screen.getByLabelText("Back"));
  expect(router.back).toHaveBeenCalled();
  await act(async () => {});
});
test("reset cancellation preserves data; confirmed reset clears persisted state", async () => {
  const clear = jest.spyOn(AsyncStorage, "clear");
  render(<Reset />);
  fireEvent.press(screen.getByText("Cancel"));
  expect(clear).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("Back"));
  await act(async () => {
    fireEvent.press(screen.getByText("Reset"));
  });
  expect(clear).toHaveBeenCalled();
  expect(useHistoryStore.getState().history).toEqual([]);
  expect(useTeamStore.getState().number).toBeNull();
  clear.mockRestore();
});

afterEach(async () => {
  await act(async () => {});
  jest.restoreAllMocks();
});
