import React from "react";
import { expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import WidgetDemo from "../../app/widget-demo";
import {
  useLiveActivityDebug,
  useLiveActivitySettings,
} from "../../lib/liveActivities/LiveActivityConnection";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

it("switches widget size and phase without changing live scouting settings", async () => {
  const enabled = useLiveActivitySettings.getState().enabled;
  const mode = useLiveActivityDebug.getState().mode;
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 402, height: 874 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <WidgetDemo />
    </SafeAreaProvider>,
  );
  expect(screen.getByTestId("scouting-widget-preview")).toHaveStyle({
    width: 364,
    height: 170,
  });
  expect(screen.getByTestId("widget-alliance-table")).toBeTruthy();

  await fireEvent.press(screen.getByText("Small"));
  expect(screen.getByTestId("scouting-widget-preview")).toHaveStyle({
    width: 170,
    height: 170,
  });
  expect(screen.queryByTestId("widget-alliance-table")).toBeNull();
  expect(
    within(screen.getByTestId("scouting-widget-preview")).queryByText("8033"),
  ).toBeNull();

  await fireEvent.press(screen.getByText("On scout"));
  expect(
    within(screen.getByTestId("scouting-widget-preview")).getByText("8033"),
  ).toBeTruthy();
  expect(
    within(screen.getByTestId("scouting-widget-preview")).getByText("8433"),
  ).toBeTruthy();
  expect(screen.queryByTestId("widget-alliance-table")).toBeNull();

  await fireEvent.press(screen.getByText("Medium"));
  expect(screen.getByTestId("widget-alliance-table")).toBeTruthy();
  expect(
    within(screen.getByTestId("scouting-widget-preview")).getByText("6:42 PM"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Before shift"));
  expect(
    within(screen.getByTestId("scouting-widget-preview")).queryByText("8033"),
  ).toBeNull();
  expect(useLiveActivitySettings.getState().enabled).toBe(enabled);
  expect(useLiveActivityDebug.getState().mode).toBe(mode);
});
