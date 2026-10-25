import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Game } from "../lib/collection/ui/Game";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { meta } from "./fixtures";

beforeEach(() => {
  jest
    .mocked(AppState.addEventListener)
    .mockImplementation(() => ({ remove: jest.fn() }));
  useReportStateStore.getState().reset();
  useReportStateStore.getState().scoutMatch(meta);
});
test("pre-match setup requires a starting position before scouting", () => {
  render(<Game />);
  expect(screen.getByLabelText("Start match")).toBeDisabled();
});

import { Alert, AppState } from "react-native";
import { router } from "expo-router";
import {
  FieldOrientation,
  useFieldOrientationStore,
} from "../lib/storage/userStores";
import { AllianceColor } from "../lib/models/AllianceColor";
import { GamePhase } from "../lib/collection/ReportState";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  jest.useRealTimers();
});
const state = () => useReportStateStore.getState();
function press(label: string) {
  fireEvent.press(screen.getByLabelText(label));
}
function begin() {
  fireEvent(screen.getByLabelText("Starting position"), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  press("Start match");
}
it.each([AllianceColor.Blue, AllianceColor.Red])(
  "%s robot setup, scoring, intake, defence and charger stay consistent",
  (allianceColor) => {
    state().scoutMatch({ ...meta, allianceColor });
    render(<Game />);
    const drag = screen.getByLabelText("Starting position");
    fireEvent(drag, "startShouldSetResponder");
    fireEvent(drag, "moveShouldSetResponder");
    fireEvent(drag, "responderGrant", { nativeEvent: { locationY: 10 } });
    fireEvent(drag, "responderMove", { nativeEvent: { locationY: 185 } });
    fireEvent(drag, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(state().startPosition).toBe(95);
    press("Pre-match piece 1: unknown");
    press("Pre-match piece 1: cone");
    press("Pre-match piece 1: cube");
    begin();
    press("Intake from alliance zone");
    press("Close selection");
    press("Intake from alliance zone");
    press("Intake cone");
    expect(screen.getByLabelText("Scoring area 1")).toBeEnabled();
    fireEvent(screen.getByLabelText("Scoring area 1"), "pressIn");
    fireEvent(screen.getByLabelText("Scoring area 1"), "pressOut");
    press("Scoring area 1");
    expect(screen.getByLabelText("Score cone at B1")).toBeDisabled();
    press("Score cone at A1");
    expect(state().events.at(-1)?.scoringLocation).toBe("A1");
    press("Leave alliance zone");
    fireEvent(screen.getByLabelText("Hold to defend"), "pressIn");
    expect(screen.getByLabelText("Enter alliance zone")).toBeDisabled();
    fireEvent(screen.getByLabelText("Hold to defend"), "pressOut");
    fireEvent(
      screen.getByLabelText("Hold to defend at opponent station"),
      "pressIn",
    );
    expect(
      screen.getByLabelText("Hold to defend at opponent station").props
        .accessibilityState.selected,
    ).toBe(true);
    fireEvent(
      screen.getByLabelText("Hold to defend at opponent station"),
      "pressOut",
    );
    press("Hold to defend");
    press("Hold to defend at opponent station");
    press("Intake from ground");
    press("Intake cube");
    press("Drop game piece");
    press("Intake from alliance station");
    press("Intake cube");
    press("Enter alliance zone");
    press("Scoring area 2");
    press("Score cube at E2");
    press("Intake from alliance zone");
    press("Intake cone");
    press("Scoring area 3");
    press("Score cone at I3");
    press("Undo");
    expect(state().events.at(-1)?.action).toBe("INTAKE_CONE");
    press("Charge station");
    expect(screen.getByLabelText("Leave alliance zone")).toBeDisabled();
    press("Leave charge station");
    expect(screen.getByLabelText("Leave alliance zone")).toBeEnabled();
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(state().gamePhase).toBe(GamePhase.Teleop);
    expect(screen.queryByLabelText("Charge station")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(105000);
    });
    expect(state().gamePhase).toBe(GamePhase.Endgame);
    expect(screen.getByLabelText("Charge station")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(30000);
    });
    expect(router.replace).toHaveBeenCalledWith("/game/post-match");
  },
);
it.each([FieldOrientation.Auspicious, FieldOrientation.Sinister])(
  "starting position mirrors correctly with orientation %s",
  (orientation) => {
    useFieldOrientationStore.getState().setValue(orientation);
    render(<Game />);
    const drag = screen.getByLabelText("Starting position");
    fireEvent(drag, "responderGrant", { nativeEvent: { locationY: 0 } });
    fireEvent(drag, "responderMove", { nativeEvent: { locationY: 185 } });
    expect(state().startPosition).toBe(
      orientation === FieldOrientation.Sinister ? 0 : 100,
    );
  },
);
test("exit, restart and early end require the appropriate confirmation", () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const view = render(<Game />);
  press("Exit scout report");
  expect(state().meta).toBeUndefined();
  expect(router.replace).toHaveBeenCalledWith("/home");
  act(() => {
    state().scoutMatch(meta);
  });
  begin();
  fireEvent.press(screen.getByText("Restart match"));
  act(() => {
    alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === "Restart")
      ?.onPress?.();
  });
  expect(state().startTimestamp).toBeUndefined();
  begin();
  fireEvent.press(screen.getByText("Exit match"));
  act(() => {
    alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === "Exit match")
      ?.onPress?.();
  });
  expect(state().meta).toBeUndefined();
  act(() => {
    state().scoutMatch(meta);
  });
  begin();
  fireEvent.press(screen.getAllByText("End match").at(-1)!);
  expect(router.replace).toHaveBeenCalledWith("/game/post-match");
  view.unmount();
  alert.mockRestore();
});

test("app backgrounding closes held defence and duplicate selection taps record one event", () => {
  const listener = jest.spyOn(AppState, "addEventListener");
  render(<Game />);
  begin();
  press("Leave alliance zone");
  fireEvent(screen.getByLabelText("Hold to defend"), "pressIn");
  act(() => {
    listener.mock.calls[0][1]("active");
    listener.mock.calls[0][1]("background");
  });
  expect(state().events.at(-1)?.action).toBe("STOP_DEFENDING");
  press("Intake from ground");
  const intake = screen.getByLabelText("Intake cube");
  act(() => {
    fireEvent.press(intake);
    fireEvent.press(intake);
  });
  expect(state().events.filter((e) => e.action === "INTAKE_CUBE")).toHaveLength(
    1,
  );
  const node = screen.UNSAFE_root.findAll(
    (n) => n.props.label === "Intake from ground",
  )[0];
  act(() => node.props.onPress());
  expect(screen.queryByLabelText("Intake cone")).toBeNull();
  act(() => {
    state().addEvent({ action: "ENTER_ZONE", location: "OPPONENT_STATION" });
  });
  press("Return to center");
  press("Enter alliance zone");
  press("Scoring area 1");
  const score = screen.getByLabelText("Score cube at B2");
  act(() => {
    fireEvent.press(score);
    fireEvent.press(score);
  });
  expect(state().events.filter((e) => e.action === "SCORE_CUBE")).toHaveLength(
    1,
  );
  const area = screen.UNSAFE_root.findAll(
    (n) => n.props.label === "Scoring area 1",
  )[0];
  act(() => area.props.onPress());
  expect(screen.queryByLabelText("Score piece at A1")).toBeNull();
  press("Intake from alliance zone");
  press("Intake cone");
  press("Scoring area 1");
  press("Undo");
  expect(screen.getByLabelText("Score piece at A1")).toBeDisabled();
  listener.mockRestore();
});

test("the field scales its artwork and targets to a smaller layout", () => {
  render(<Game />);
  fireEvent(screen.getByTestId("scouting-field"), "layout", {
    nativeEvent: { layout: { width: 426, height: 167, x: 0, y: 0 } },
  });
  expect(
    screen.UNSAFE_root.findAll(
      (node) =>
        node.props.style?.width === 426 && node.props.style?.height === 167,
    ).length,
  ).toBeGreaterThan(0);
});
