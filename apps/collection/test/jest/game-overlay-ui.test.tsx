import React from "react";
import { render, screen, userEvent } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { GameViewTemplate } from "../../lib/collection/ui/GameViewTemplate";
import { PreMatchActions } from "../../lib/collection/ui/actions/PreMatchActions";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { useTeamStore } from "../../lib/storage/userStores";
import { meta } from "./fixtures";

jest.mock("@react-native-menu/menu", () => ({ MenuView: () => null }));
jest.mock("../../lib/training/TrainingReadyButton", () => ({
  TrainingReadyButton: () => null,
}));

test("closed outpost actions leave no hidden touch controls over the field", async () => {
  useTeamStore.setState({ number: null, code: "" });
  useReportStateStore.getState().scoutMatch(meta);
  const setOverlay = jest.fn<(value: boolean) => void>();
  const props = {
    field: <PreMatchActions />,
    gamePhaseMessage: "Pre-Match",
    setOverlay,
    onEnd: jest.fn(),
    onRestart: jest.fn(),
  };
  const view = await render(<GameViewTemplate {...props} overlay={false} />);
  expect(
    screen.queryByLabelText("Close Overlay", { includeHiddenElements: true }),
  ).toBeNull();
  await userEvent
    .setup()
    .press(screen.getByRole("button", { name: "Start position Hub" }));
  expect(
    screen.getByRole("button", { name: "Start position Hub" }),
  ).toBeSelected();
  await view.rerender(<GameViewTemplate {...props} overlay />);
  await userEvent.setup().press(screen.getByLabelText("Close Overlay"));
  expect(setOverlay).toHaveBeenCalledWith(false);
  await view.rerender(<GameViewTemplate {...props} overlay={false} />);
  expect(
    screen.queryByLabelText("Close Overlay", { includeHiddenElements: true }),
  ).toBeNull();
});
