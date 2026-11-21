import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import HistoryDetails from "../../app/history/[uuid]";
import { useHistoryStore } from "../../lib/storage/historyStore";
import { uploadReport } from "../../lib/lovatAPI/uploadReport";
import { makeReport, meta } from "./fixtures";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    uuid: "11111111-1111-4111-8111-111111111111",
  }),
  router: { back: jest.fn() },
}));
jest.mock("../../lib/components/NavBar", () => ({ NavBar: () => null }));
jest.mock("../../lib/components/IconButton", () => ({
  IconButton: () => null,
}));
jest.mock("../../lib/collection/ui/ScoutReportCode", () => ({
  ScoutReportCode: () => null,
}));
jest.mock("../../lib/lovatAPI/uploadReport", () => ({
  uploadReport: jest.fn(),
}));
beforeEach(() => {
  jest.useFakeTimers();
  useHistoryStore.setState({ history: [] });
  useHistoryStore.getState().upsertMatch(makeReport(), false, meta);
});
test("retry preserves an offline report until a later upload succeeds", async () => {
  jest
    .mocked(uploadReport)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined);
  await render(<HistoryDetails />);
  await fireEvent.press(screen.getByText("Upload"));
  expect(await screen.findByText("Offline")).toBeOnTheScreen();
  expect(useHistoryStore.getState().history[0].uploaded).toBe(false);
  await fireEvent.press(screen.getByText("Upload"));
  await act(async () => {});
  expect(useHistoryStore.getState().history[0].uploaded).toBe(true);
  expect(screen.queryByText("Upload")).not.toBeOnTheScreen();
  expect(jest.mocked(uploadReport).mock.calls[0]).toEqual(
    jest.mocked(uploadReport).mock.calls[1],
  );
});
