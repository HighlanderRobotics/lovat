import React from "react";
import { it, expect, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Sidebar } from "../../lib/components/Sidebar";
import Debug from "../../app/debug";
import { useLiveActivitySettings } from "../../lib/liveActivities/LiveActivityConnection";
import {
  activityPreview,
  activityStateSchema,
} from "../../lib/liveActivities/state";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

it("makes Debug reachable from the sidebar without an account role", async () => {
  await render(<Sidebar />);
  await fireEvent.press(screen.getByLabelText("Open sidebar"));
  await fireEvent.press(screen.getByText("Debug"));
  expect(router.push).toHaveBeenCalledWith("/debug");
});

it("provides valid waiting and on-shift previews without changing match types", () => {
  const waiting = activityStateSchema.parse(activityPreview("waiting"));
  const active = activityStateSchema.parse(activityPreview("onShift"));
  expect(waiting.phase).toBe("waiting");
  expect(active.assignments.map((assignment) => assignment.matchLabel)).toEqual(
    ["Q28", "Q39", "P1", "F1"],
  );
  expect(active.assignments[0].teamNumber).toBe(8433);
});

it("lets every scout select and save all four Dynamic Island styles", async () => {
  useLiveActivitySettings.setState({ mascotStyle: "plain" });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 402, height: 874 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <Debug />
    </SafeAreaProvider>,
  );
  expect(
    screen.getByRole("radio", { name: "Style 2 · Plain", checked: true }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("radio", { name: "Style 1 · Original" }),
  );
  expect(useLiveActivitySettings.getState().mascotStyle).toBe("original");
  await fireEvent.press(
    screen.getByRole("radio", { name: "Style 3 · Outline" }),
  );
  expect(useLiveActivitySettings.getState().mascotStyle).toBe("outlined");
  expect(
    screen.getByRole("radio", {
      name: "Style 3 · Outline",
      checked: true,
    }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("radio", { name: "Style 4 · Holding binoculars" }),
  );
  expect(useLiveActivitySettings.getState().mascotStyle).toBe("holding");
  await useLiveActivitySettings.persist.rehydrate();
  expect(useLiveActivitySettings.getState().mascotStyle).toBe("holding");
});
