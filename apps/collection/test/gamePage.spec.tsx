import React from "react";
import { Platform } from "react-native";
import { act, render } from "@testing-library/react-native";
import { useIsFocused } from "@react-navigation/native";
import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";
import GamePage from "../app/game/index";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { meta, startReport } from "./fixtures";

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useIsFocused: jest.fn(() => true),
}));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));
jest.mock("expo-navigation-bar", () => ({
  setVisibilityAsync: jest.fn(async () => {}),
}));
it.each(["ios", "android"])(
  "%s keeps the display awake only during focused active scouting",
  async (os) => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });
    useReportStateStore.getState().reset();
    useReportStateStore.getState().scoutMatch(meta);
    const view = render(<GamePage />);
    expect(useKeepAwake).not.toHaveBeenCalled();
    act(() => {
      startReport();
    });
    expect(useKeepAwake).toHaveBeenCalledWith("collection-active-match", {
      suppressDeactivateWarnings: true,
    });
    jest.mocked(useIsFocused).mockReturnValue(false);
    view.rerender(<GamePage />);
    view.unmount();
    if (os === "android") {
      expect(NavigationBar.setVisibilityAsync).toHaveBeenCalledWith("hidden");
      expect(NavigationBar.setVisibilityAsync).toHaveBeenCalledWith("visible");
    }
    Object.defineProperty(Platform, "OS", {
      value: original,
      configurable: true,
    });
    jest.mocked(useIsFocused).mockReturnValue(true);
    await act(async () => {});
  },
);
