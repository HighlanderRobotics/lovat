import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { useHistoryStore } from "../lib/storage/historyStore";
import { useScouterScheduleStore } from "../lib/services";
import {
  useScouterStore,
  useTournamentStore,
  useQrCodeSizeStore,
} from "../lib/storage/userStores";
import { uploadReport } from "../lib/lovatAPI/uploadReport";
import { router } from "expo-router";
import Submit from "../app/game/submit";
import { meta, scout, tournament, startReport } from "./fixtures";
jest.mock("../lib/lovatAPI/uploadReport", () => ({ uploadReport: jest.fn() }));
beforeEach(() => {
  startReport();
  useHistoryStore.setState({ history: [] });
  useQrCodeSizeStore.getState().setValue(5000);
  useScouterStore.getState().setValue(scout);
  useTournamentStore.getState().setValue(tournament);
  useScouterScheduleStore.setState({
    data: {
      tournamentKey: tournament.key,
      hash: "test",
      data: [
        {
          matchIdentity: { ...meta.matchIdentity, matchNumber: 2 },
          scouters: {
            scout: { teamNumber: 118, allianceColor: meta.allianceColor },
          },
        },
      ],
    },
  });
});
test("a successful upload remains attached to its original report while Scout Next starts the assigned team", async () => {
  jest.mocked(uploadReport).mockResolvedValue(undefined);
  const uuid = useReportStateStore.getState().uuid;
  render(<Submit />);
  await screen.findByText("Uploaded");
  expect(useHistoryStore.getState().history[0].scoutReport.uuid).toBe(uuid);
  expect(useHistoryStore.getState().history[0].uploaded).toBe(true);
  expect(screen.getByText("118 in Qualifier 2")).toBeTruthy();
  fireEvent.press(screen.getByText("Scout Next Match"));
  expect(useReportStateStore.getState().meta?.teamNumber).toBe(118);
  expect(router.replace).toHaveBeenCalledWith("/game");
  expect(useHistoryStore.getState().history[0].scoutReport.uuid).toBe(uuid);
  expect(jest.mocked(uploadReport).mock.calls[0][0].uuid).toBe(uuid);
});
it.each([
  ["Scout report already uploaded", "Already uploaded"],
  ["Match does not exist", "Match does not exist"],
  ["Offline", "Upload failed"],
])("upload error %s is preserved for retry", async (message, label) => {
  jest.mocked(uploadReport).mockRejectedValue(new Error(message));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  useScouterScheduleStore.setState({ data: null });
  render(<Submit />);
  await screen.findByText(label);
  expect(useHistoryStore.getState().history[0].uploaded).toBe(false);
  expect(screen.queryByText("Scout Next Match")).toBeNull();
  fireEvent.press(screen.getByText("Go to Home"));
  expect(useReportStateStore.getState().meta).toBeUndefined();
  log.mockRestore();
});
test("the submission screen is safe when no report is open", () => {
  useReportStateStore.getState().reset();
  render(<Submit />);
  expect(screen.toJSON()).toBeNull();
});
test("a changed scout or tournament never receives another scout's next assignment", async () => {
  jest.mocked(uploadReport).mockResolvedValue(undefined);
  useScouterStore.getState().setValue({ ...scout, uuid: "another" });
  render(<Submit />);
  await screen.findByText("Uploaded");
  expect(screen.queryByText("Scout Next Match")).toBeNull();
  act(() => {
    useScouterStore.getState().setValue(scout);
    useTournamentStore.getState().setValue({ ...tournament, key: "other" });
  });
  expect(screen.queryByText("Scout Next Match")).toBeNull();
});

import { SubmissionActions } from "../lib/collection/ui/SubmissionActions";
test("a stale next-match callback is harmless when no assignment is available", async () => {
  jest.mocked(uploadReport).mockResolvedValue(undefined);
  useScouterScheduleStore.setState({ data: null });
  render(<Submit />);
  await screen.findByText("Uploaded");
  const uuid = useReportStateStore.getState().uuid;
  act(() => {
    screen.UNSAFE_getByType(SubmissionActions).props.onNext();
  });
  expect(useReportStateStore.getState().uuid).toBe(uuid);
  expect(router.replace).not.toHaveBeenCalled();
});
