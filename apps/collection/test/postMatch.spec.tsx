import { AllianceColor } from "../lib/models/AllianceColor";
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import PostMatch from "../app/game/post-match";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { MatchType } from "../lib/models/match";

beforeEach(() => {
  useReportStateStore.getState().reset();
  useReportStateStore.getState().scoutMatch({
    scouterUUID: "scout",
    teamNumber: 8033,
    allianceColor: AllianceColor.Blue,
    matchIdentity: {
      tournamentKey: "2023mock",
      matchNumber: 1,
      matchType: MatchType.Practice,
    },
  });
});
test("scouters can report a no-show and replace it with an observed role", () => {
  render(<PostMatch />);
  fireEvent.press(screen.getByRole("checkbox", { name: "Offence" }));
  expect(useReportStateStore.getState().robotRoles).toEqual(["OFFENCE"]);
  fireEvent.press(screen.getByRole("checkbox", { name: "No show" }));
  expect(useReportStateStore.getState().robotRoles).toEqual(["NO_SHOW"]);
  fireEvent.press(screen.getByRole("checkbox", { name: "Immobile" }));
  expect(useReportStateStore.getState().robotRoles).toEqual(["IMMOBILE"]);
  act(() => useReportStateStore.getState().reset());
  expect(screen.toJSON()).toBeNull();
});

import { Alert, TextInput } from "react-native";
import { router } from "expo-router";
import { useTrainingModeStore } from "../lib/storage/userStores";
test("post-match answers remain editable, invalid alliance links block submission, and discard clears the report", () => {
  useTrainingModeStore.setState({ value: false });
  useReportStateStore
    .getState()
    .scoutMatch({ ...useReportStateStore.getState().meta! }, ["Recovery?"]);
  render(<PostMatch />);
  fireEvent.press(screen.getByRole("radio", { name: "5 · Exceptional" }));
  fireEvent.press(screen.getByRole("radio", { name: "5 · Great" }));
  fireEvent(
    screen.getByLabelText("Active vs camping defence"),
    "valueChange",
    75,
  );
  for (const group of [
    "Intake sources",
    "Game pieces",
    "Paths into alliance zone",
  ]) {
    const node = screen.getByLabelText(group);
    fireEvent.press(within(node).getByRole("radio", { name: "Both" }));
  }
  fireEvent.press(screen.getByRole("radio", { name: "Succeeded" }));
  fireEvent.press(
    screen.getByRole("checkbox", { name: "Alliance achieved coopertition" }),
  );
  fireEvent.press(screen.getByRole("checkbox", { name: "Robot broke" }));
  fireEvent.changeText(
    screen.getByPlaceholderText("How did it break?"),
    "Intake jammed",
  );
  fireEvent.changeText(
    screen.getByLabelText("Recovery?"),
    "Recovered in ten seconds",
  );
  const notes = screen
    .UNSAFE_getAllByType(TextInput)
    .find(
      (input) =>
        input.props.multiline &&
        !input.props.accessibilityLabel &&
        !input.props.placeholder,
    )!;
  fireEvent.changeText(notes, "Stayed mobile");
  fireEvent.press(screen.getByRole("checkbox", { name: "Robot broke" }));
  fireEvent.changeText(
    screen.getByPlaceholderText("Alliance links scored"),
    "-1",
  );
  expect(screen.getByText("Submit")).toBeDisabled();
  fireEvent.changeText(
    screen.getByPlaceholderText("Alliance links scored"),
    "9999999999999999999999",
  );
  expect(screen.getByText("Submit")).toBeDisabled();
  fireEvent.changeText(
    screen.getByPlaceholderText("Alliance links scored"),
    "2",
  );
  fireEvent.press(screen.getByText("Submit"));
  expect(router.replace).toHaveBeenCalledWith("/game/submit");
  expect(useReportStateStore.getState()).toMatchObject({
    activeDefensePercentage: 75,
    intakeType: "BOTH",
    intakePieces: "BOTH",
    mobility: "BOTH",
    links: 2,
    notes: "Stayed mobile",
    endgameResult: "SUCCEEDED",
  });
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  fireEvent.press(screen.getByText("Discard match"));
  act(() => {
    alert.mock.calls[0][2]
      ?.find((button) => button.text === "Discard")
      ?.onPress?.();
  });
  expect(useReportStateStore.getState().meta).toBeUndefined();
  alert.mockRestore();
});
test("local practice training mode blocks submission", () => {
  useTrainingModeStore.setState({ value: true });
  render(<PostMatch />);
  expect(screen.getByText("Submit")).toBeDisabled();
  expect(
    screen.getByText("Disable training mode in settings to submit data."),
  ).toBeTruthy();
  act(() => {
    useTrainingModeStore.setState({ value: false });
  });
});
