import React from "react";
import { it, expect, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Sidebar } from "../../lib/components/Sidebar";
import Debug from "../../app/debug";
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

it("keeps both previews available without obsolete mascot style controls", async () => {
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
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByText("Preview before shift")).toBeTruthy();
  expect(screen.getByText("Preview on shift")).toBeTruthy();
});
