import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import History from "../app/history/index";
import Details from "../app/history/[uuid]";
import { useHistoryStore } from "../lib/storage/historyStore";
import { uploadReport } from "../lib/lovatAPI/uploadReport";
import { useQrCodeSizeStore } from "../lib/storage/userStores";
import { meta, startReport } from "./fixtures";

jest.mock("../lib/lovatAPI/uploadReport", () => ({ uploadReport: jest.fn() }));
beforeEach(() => {
  useHistoryStore.setState({ history: [] });
  useQrCodeSizeStore.getState().setValue(5000);
});
it.each([0, 1, 7])(
  "history formats reports from %s days ago and searches match/team text",
  (days) => {
    const report = {
      ...startReport(),
      startTime: Date.now() - days * 86400000,
    };
    useHistoryStore.getState().upsertMatch(report, true, meta);
    render(<History />);
    expect(
      screen.getByText(
        days === 0
          ? /Today at/
          : days === 1
            ? /Yesterday at/
            : /\d{2}\/\d{2}\/\d{2} at/,
      ),
    ).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "Qualifier");
    expect(screen.getByText("Qualifier 1")).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "254");
    expect(screen.getByText("Qualifier 1")).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "missing");
    expect(screen.queryByText("Qualifier 1")).toBeNull();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
  },
);
test("history retries a report and only deletes it after confirmation", async () => {
  const report = startReport();
  useHistoryStore.getState().upsertMatch(report, false, meta);
  jest.mocked(uploadReport).mockResolvedValue(undefined);
  render(<History />);
  await act(async () => {
    fireEvent.press(screen.getByText("Upload report"));
  });
  expect(useHistoryStore.getState().history[0].uploaded).toBe(true);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  fireEvent.press(screen.getByText("Discard data"));
  expect(useHistoryStore.getState().history).toHaveLength(1);
  act(() => {
    alert.mock.calls[0][2]
      ?.find((button) => button.style === "destructive")
      ?.onPress?.();
  });
  expect(useHistoryStore.getState().history).toEqual([]);
  alert.mockRestore();
});
it.each([new Error("No connection"), null])(
  "history displays upload failure %s without dropping the report",
  async (failure) => {
    useHistoryStore.getState().upsertMatch(startReport(), false, meta);
    jest.mocked(uploadReport).mockRejectedValue(failure);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    render(<History />);
    await act(async () => {
      fireEvent.press(screen.getByText("Upload report"));
    });
    expect(alert).toHaveBeenCalledWith(
      "Failed to upload",
      failure instanceof Error ? failure.message : "An unknown error occurred",
    );
    expect(useHistoryStore.getState().history).toHaveLength(1);
    alert.mockRestore();
  },
);
it.each([
  null,
  new Error("Scout report already uploaded"),
  new Error("Offline"),
  "bad response",
])(
  "history details preserve or finalize the report after upload response %s",
  async (failure) => {
    const report = startReport();
    useHistoryStore.getState().upsertMatch(report, false, meta);
    jest.mocked(useLocalSearchParams).mockReturnValue({ uuid: report.uuid });
    if (failure === null)
      jest.mocked(uploadReport).mockResolvedValue(undefined);
    else jest.mocked(uploadReport).mockRejectedValue(failure);
    render(<Details />);
    fireEvent.press(screen.getByText("Upload"));
    await act(async () => {});
    if (
      failure === null ||
      (failure instanceof Error &&
        failure.message === "Scout report already uploaded")
    )
      expect(useHistoryStore.getState().history[0].uploaded).toBe(true);
    else expect(useHistoryStore.getState().history[0].uploaded).toBe(false);
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
  },
);
