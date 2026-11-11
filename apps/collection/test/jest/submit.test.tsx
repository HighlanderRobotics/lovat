import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import Submit from "../../app/game/submit";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { useHistoryStore } from "../../lib/storage/historyStore";
import { uploadReport } from "../../lib/lovatAPI/uploadReport";
import { meta } from "./fixtures";

jest.mock("expo-router", () => ({
  useNavigation: () => ({ dispatch: jest.fn() }),
}));
jest.mock("../../lib/collection/resetNavigation", () => ({
  resetToStart: jest.fn(),
}));
jest.mock("../../lib/collection/ui/ScoutReportCode", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    ScoutReportCode: function MockScoutReportCode() {
      return React.createElement(Text, null, "Offline QR transfer");
    },
  };
});
jest.mock("../../lib/components/NavBar", () => ({ NavBar: () => null }));
jest.mock("../../lib/lovatAPI/uploadReport", () => ({
  uploadReport: jest.fn(),
}));
jest.mock("../../lib/lovatAPI/reportLifecycle", () => ({
  syncReportLifecycle: jest.fn(async () => {}),
}));
beforeEach(() => {
  useReportStateStore.getState().reset();
  useHistoryStore.setState({ history: [] });
  useReportStateStore.getState().scoutMatch(meta);
  useReportStateStore.getState().initializeMatchTimestamp(1000);
});
test("success marks the same saved UUID uploaded only after the request resolves", async () => {
  let resolve!: () => void;
  jest.mocked(uploadReport).mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  await render(<Submit />);
  expect(screen.getByText("Uploading")).toBeOnTheScreen();
  expect(screen.getByText("Offline QR transfer")).toBeOnTheScreen();
  expect(useHistoryStore.getState().history[0].uploaded).toBe(false);
  await act(async () => {
    resolve();
  });
  expect(screen.getByText("Uploaded")).toBeOnTheScreen();
  expect(useHistoryStore.getState().history[0].uploaded).toBe(true);
});
test("failed upload keeps an offline report and QR fallback after Done", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(uploadReport).mockRejectedValue(new Error("Offline"));
  await render(<Submit />);
  expect(await screen.findByText("Upload failed")).toBeOnTheScreen();
  expect(screen.getByText("Offline QR transfer")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Done"));
  expect(useHistoryStore.getState().history).toHaveLength(1);
  expect(useHistoryStore.getState().history[0].uploaded).toBe(false);
});
