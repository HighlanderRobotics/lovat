import React from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { GameViewTemplate } from "../lib/collection/ui/GameViewTemplate";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { meta } from "./fixtures";
const callbacks = { onExit: jest.fn(), onEnd: jest.fn(), onRestart: jest.fn() };
test("header exposes preload choices, current piece, undo and match actions", () => {
  const state = () => useReportStateStore.getState();
  state().reset();
  state().scoutMatch(meta);
  const view = render(
    <GameViewTemplate
      {...callbacks}
      field={<Text>Field</Text>}
      gamePhaseMessage="Pre-match"
      startEnabled
    />,
  );
  fireEvent.press(screen.getByLabelText("Preload cone"));
  expect(state().preloadedPiece).toBe("CONE");
  fireEvent.press(screen.getByLabelText("Preload cube"));
  expect(state().preloadedPiece).toBe("CUBE");
  fireEvent.press(screen.getByLabelText("Preload none"));
  expect(state().preloadedPiece).toBeNull();
  act(() => {
    state().setStartPosition(50);
  });
  fireEvent.press(screen.getByLabelText("Start match"));
  expect(state().startTimestamp).toBeDefined();
  act(() => {
    state().addEvent({ action: "INTAKE_CONE", location: "ALLIANCE_ZONE" });
  });
  fireEvent.press(screen.getByLabelText("Undo"));
  expect(state().events).toEqual([]);
  fireEvent.press(screen.getAllByText("End match").at(-1)!);
  fireEvent.press(screen.getByText("Exit match"));
  fireEvent.press(screen.getByText("Restart match"));
  expect(callbacks.onEnd).toHaveBeenCalled();
  expect(callbacks.onExit).toHaveBeenCalled();
  expect(callbacks.onRestart).toHaveBeenCalled();
  act(() => {
    state().reset();
  });
  expect(view.toJSON()).toBeNull();
});
