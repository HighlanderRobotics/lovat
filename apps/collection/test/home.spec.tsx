import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import Home from "../app/home";
import { router } from "expo-router";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { useHistoryStore } from "../lib/storage/historyStore";
import {
  MatchSelectionMode,
  useMatchSelectionModeStore,
  useScouterStore,
  useTournamentStore,
  useStartMatchEnabledStore,
} from "../lib/storage/userStores";
import {
  useScouterScheduleStore,
  useTournamentsStore,
  useTeamScoutersStore,
  useMatchScheduleStore,
  useServiceErrorStore,
  useServicesLoadingStore,
} from "../lib/services";
import { useConnectivityStore } from "../lib/network/connectivity";
import { MatchType } from "../lib/models/match";
import { AllianceColor } from "../lib/models/AllianceColor";
import { meta, scout, tournament, startReport } from "./fixtures";

jest.mock("../lib/services", () => ({
  ...jest.requireActual("../lib/services"),
  getServiceLoader: jest.fn(() => jest.fn(async () => {})),
}));
jest.mock("react-native-wheel-pick", () => ({
  Picker: (props: object) =>
    jest
      .requireActual("react")
      .createElement(jest.requireActual("react-native").View, {
        ...props,
        accessibilityLabel: "Match selector",
      }),
}));
beforeEach(() => {
  useReportStateStore.getState().reset();
  useHistoryStore.setState({ history: [] });
  useScouterStore.getState().setValue(scout);
  useTournamentStore.getState().setValue(tournament);
  useStartMatchEnabledStore.getState().setValue(true);
  useMatchSelectionModeStore.getState().setValue(MatchSelectionMode.Automatic);
  useScouterScheduleStore.setState({ data: null, timestamp: null });
  useTournamentsStore.setState({ data: [tournament], timestamp: Date.now() });
  useTeamScoutersStore.setState({ data: [scout], timestamp: Date.now() });
  useMatchScheduleStore.setState({ data: null, timestamp: null });
  useServiceErrorStore.getState().setValue(null);
  useServicesLoadingStore.getState().setValue(false);
  useConnectivityStore.setState({ status: "online" });
});
const assignment = (matchNumber: number, matchType = MatchType.Qualifier) => ({
  matchIdentity: { ...meta.matchIdentity, matchNumber, matchType },
  scouters: {
    scout: {
      teamNumber: matchNumber === 1 ? 254 : 118,
      allianceColor: AllianceColor.Red,
    },
  },
});
test("unassigned scouts can use manual details without a match-exists request", () => {
  render(<Home />);
  expect(screen.getByText("No matches found")).toBeTruthy();
  expect(screen.getByText("Scout this match")).toBeDisabled();
  fireEvent.press(screen.getByLabelText("history"));
  fireEvent.press(screen.getByLabelText("settings"));
  expect(router.push).toHaveBeenCalledWith("/history");
  expect(router.push).toHaveBeenCalledWith("/settings");
  fireEvent.press(screen.getByText("Enter details manually"));
  fireEvent.changeText(screen.getByPlaceholderText("Match number"), "2");
  fireEvent.changeText(screen.getByPlaceholderText("8033"), "254");
  expect(screen.getByText("Scout this match")).toBeEnabled();
  fireEvent.press(screen.getByText("Practice"));
  fireEvent.press(screen.getByText("Blue"));
  fireEvent.press(screen.getByText("Scout this match"));
  expect(useReportStateStore.getState().meta).toMatchObject({
    teamNumber: 254,
    allianceColor: AllianceColor.Blue,
    matchIdentity: { matchNumber: 2, matchType: MatchType.Practice },
  });
  expect(router.replace).toHaveBeenCalledWith("/game");
});
it.each(["red", "blue", null] as const)(
  "manual selection uses the cached %s alliance when available",
  (alliance) => {
    useMatchSelectionModeStore.getState().setValue(MatchSelectionMode.Manual);
    useMatchScheduleStore.setState({
      data: {
        tournamentKey: tournament.key,
        matches: [
          {
            matchNumber: 2,
            matchType: 0,
            teams: [
              { number: 254, alliance },
              { number: 118, alliance: null },
            ],
          },
        ],
      },
    });
    render(<Home />);
    fireEvent.changeText(screen.getByPlaceholderText("Match number"), "2");
    fireEvent.changeText(screen.getByPlaceholderText("8033"), "254");
    fireEvent.press(screen.getByText("Blue"));
    expect(screen.getByText(/Scheduled teams: 254/)).toBeTruthy();
    fireEvent.press(screen.getByText("Scout this match"));
    expect(useReportStateStore.getState().meta?.allianceColor).toBe(
      alliance === "red" ? AllianceColor.Red : AllianceColor.Blue,
    );
  },
);
test("manual details reject invalid numbers, missing scout and missing event", () => {
  useMatchSelectionModeStore.getState().setValue(MatchSelectionMode.Manual);
  render(<Home />);
  for (const team of ["-1", "1.5", "99999999999999999999"]) {
    fireEvent.changeText(screen.getByPlaceholderText("8033"), team);
    expect(screen.getByText("Scout this match")).toBeDisabled();
  }
  fireEvent.changeText(screen.getByPlaceholderText("8033"), "254");
  fireEvent.changeText(screen.getByPlaceholderText("Match number"), "0");
  expect(screen.getByText("Scout this match")).toBeDisabled();
  fireEvent.changeText(screen.getByPlaceholderText("Match number"), "1");
  act(() => {
    useTournamentStore.getState().setValue(null);
  });
  expect(screen.getByText("Scout this match")).toBeDisabled();
  act(() => {
    useTournamentStore.getState().setValue(tournament);
    useScouterStore.getState().setValue(null);
  });
  expect(screen.getByText("Scout this match")).toBeDisabled();
  fireEvent.press(screen.getByText("Use scouter schedule"));
});
it.each([[], [1], [2, 1], [3, 2, 1]].map((completed) => ({ completed })))(
  "automatic selection advances from qualification history $completed",
  ({ completed }) => {
    const report = startReport();
    useReportStateStore.getState().reset();
    useHistoryStore.setState({
      history: completed.map((n) => ({
        scoutReport: report,
        uploaded: true,
        meta: {
          ...meta,
          matchIdentity: { ...meta.matchIdentity, matchNumber: n },
        },
      })),
    });
    useScouterScheduleStore.setState({
      data: {
        tournamentKey: tournament.key,
        hash: "test",
        data: [
          assignment(3),
          assignment(1),
          assignment(2),
          assignment(1, MatchType.Elimination),
        ],
      },
    });
    render(<Home />);
    expect(screen.getByLabelText("Match selector")).toBeTruthy();
    fireEvent(
      screen.getByLabelText("Match selector"),
      "valueChange",
      "2023test_q1",
    );
    expect(screen.getByText("Scouting 254")).toBeTruthy();
    fireEvent(
      screen.getByLabelText("Match selector"),
      "valueChange",
      "unknown",
    );
    expect(screen.getByText("No matches found")).toBeTruthy();
  },
);
test("service status distinguishes loading, cached data, offline operation and no data", () => {
  render(<Home />);
  expect(screen.getByText("Connected")).toBeTruthy();
  act(() => {
    useServicesLoadingStore.getState().setValue(true);
  });
  fireEvent.press(screen.getByLabelText("Refresh schedules"));
  act(() => {
    useServicesLoadingStore.getState().setValue(false);
    useServiceErrorStore.getState().setValue("offline refresh failed");
  });
  expect(screen.getByText(/Updated/)).toBeTruthy();
  act(() => {
    useConnectivityStore.setState({ status: "offline" });
  });
  expect(screen.getByText("Offline")).toBeTruthy();
  act(() => {
    useConnectivityStore.setState({ status: "online" });
    useTeamScoutersStore.setState({ data: null });
    useTournamentsStore.setState({ data: null });
  });
  expect(screen.getByText("Unavailable")).toBeTruthy();
});

import Button from "../lib/components/Button";
import { Platform } from "react-native";
test("a stale native start callback is harmless without valid match details", () => {
  render(<Home />);
  const buttons = screen.UNSAFE_getAllByType(Button);
  act(() => {
    buttons
      .find((button) => button.props.children === "Scout this match")!
      .props.onPress();
  });
  expect(useReportStateStore.getState().meta).toBeUndefined();
});
it.each([
  {
    matches: [
      assignment(2),
      assignment(1, MatchType.Elimination),
      assignment(1),
      assignment(2, MatchType.Elimination),
      assignment(1),
    ],
    completed: [1, 2],
    playoffs: true,
  },
  {
    matches: [
      assignment(1, MatchType.Elimination),
      assignment(3),
      assignment(1),
      assignment(2),
    ],
    completed: [1, 2, 3],
    playoffs: true,
  },
  {
    matches: [assignment(1), assignment(3), assignment(2), assignment(3)],
    completed: [1, 2, 3],
    playoffs: false,
  },
  { matches: [assignment(1)], completed: [99], playoffs: false },
])(
  "automatic schedule handles mixed ordering and completed-match boundaries %#",
  ({ matches, completed, playoffs }) => {
    const report = startReport();
    useReportStateStore.getState().reset();
    useHistoryStore.setState({
      history: completed.flatMap((n) => [
        {
          scoutReport: report,
          uploaded: true,
          meta: {
            ...meta,
            matchIdentity: { ...meta.matchIdentity, matchNumber: n },
          },
        },
        ...(playoffs
          ? [
              {
                scoutReport: report,
                uploaded: true,
                meta: {
                  ...meta,
                  matchIdentity: {
                    ...meta.matchIdentity,
                    matchNumber: n,
                    matchType: MatchType.Elimination,
                  },
                },
              },
            ]
          : []),
      ]),
    });
    useScouterScheduleStore.setState({
      data: { tournamentKey: tournament.key, hash: "sorting", data: matches },
    });
    render(<Home />);
    expect(screen.getByText(/Scouting/)).toBeTruthy();
  },
);
test("a schedule for another tournament is never selected even with existing history", () => {
  const report = startReport();
  useReportStateStore.getState().reset();
  useHistoryStore.setState({
    history: [{ scoutReport: report, meta, uploaded: true }],
  });
  useScouterScheduleStore.setState({
    data: {
      tournamentKey: "other",
      hash: "other",
      data: [
        {
          ...assignment(1),
          matchIdentity: { ...meta.matchIdentity, tournamentKey: "other" },
        },
      ],
    },
  });
  render(<Home />);
  expect(screen.getByText("No matches found")).toBeTruthy();
});
test("Android's match picker retains the selected value without the iOS remount key", () => {
  const old = Platform.OS;
  Object.defineProperty(Platform, "OS", {
    value: "android",
    configurable: true,
  });
  useScouterScheduleStore.setState({
    data: {
      tournamentKey: tournament.key,
      hash: "android",
      data: [assignment(1)],
    },
  });
  render(<Home />);
  expect(screen.getByLabelText("Match selector").props.selectedValue).toBe(
    "2023test_q1",
  );
  Object.defineProperty(Platform, "OS", { value: old, configurable: true });
});
