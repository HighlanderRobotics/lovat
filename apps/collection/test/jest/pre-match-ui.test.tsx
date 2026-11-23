import React from "react";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { beforeEach, expect, test } from "@jest/globals";
import { PreMatchActions } from "../../lib/collection/ui/actions/PreMatchActions";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { MatchEventPosition } from "../../lib/collection/MatchEventPosition";
import { useTeamStore } from "../../lib/storage/userStores";
import { useTrainingSessionStore } from "../../lib/training/trainingStore";
import { meta } from "./fixtures";

beforeEach(() => {
  useTeamStore.setState({ number: null, code: "" });
  useReportStateStore.getState().reset();
  useTrainingSessionStore.getState().clear();
});

test("a live-match starting-position press updates the report and selected button", async () => {
  useReportStateStore.getState().scoutMatch(meta);
  await render(<PreMatchActions />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Start position Hub" }));
  expect(useReportStateStore.getState().startPosition).toBe(
    MatchEventPosition.Hub,
  );
  expect(
    screen.getByRole("button", { name: "Start position Hub" }),
  ).toBeSelected();
  await user.press(
    screen.getByRole("button", { name: "Start position LeftTrench" }),
  );
  expect(useReportStateStore.getState().startPosition).toBe(
    MatchEventPosition.LeftTrench,
  );
  expect(
    screen.getByRole("button", { name: "Start position Hub" }),
  ).not.toBeSelected();
});

test("a disconnected paired session prevents starting-position changes", async () => {
  useReportStateStore.setState({
    meta: {
      ...meta,
      collection: {
        sourceTeamNumber: 9999,
        trainingAttemptUuid: "33333333-3333-4333-8333-333333333333",
      },
    },
  });
  await render(<PreMatchActions />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Start position Hub" }));
  expect(useReportStateStore.getState().startPosition).toBeUndefined();
  await act(async () => {
    useReportStateStore.getState().scoutMatch(meta);
  });
  await user.press(screen.getByRole("button", { name: "Start position Hub" }));
  expect(useReportStateStore.getState().startPosition).toBe(
    MatchEventPosition.Hub,
  );
});
