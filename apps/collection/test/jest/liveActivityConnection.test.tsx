import React from "react";
import { afterEach, expect, it, jest } from "@jest/globals";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { liveActivities } from "../../modules/lovat-live-activities";
import {
  LiveActivityConnection,
  useLiveActivityDebug,
  useLiveActivitySettings,
} from "../../lib/liveActivities/LiveActivityConnection";

jest.mock("../../modules/lovat-live-activities", () => ({
  liveActivities: {
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    status: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ active: true }),
    sync: jest.fn<() => Promise<unknown>>().mockResolvedValue({ active: true }),
  },
}));

const originalAppState = AppState.currentState;
afterEach(() => {
  AppState.currentState = originalAppState;
});

it("updates the same native activity when switching preview layouts", async () => {
  AppState.currentState = "active";
  await useLiveActivitySettings.persist.rehydrate();
  useLiveActivitySettings.setState({ enabled: true });
  useLiveActivityDebug.setState({ mode: "waiting", revision: 1 });
  await render(<LiveActivityConnection />);
  await waitFor(() => expect(liveActivities?.sync).toHaveBeenCalledTimes(1));
  const stopped = jest.mocked(liveActivities!.stop).mock.calls.length;

  await act(() => {
    useLiveActivityDebug.setState({ mode: "onShift", revision: 2 });
  });
  await waitFor(() => expect(liveActivities?.sync).toHaveBeenCalledTimes(2));
  expect(liveActivities?.stop).toHaveBeenCalledTimes(stopped);
  const calls = jest.mocked(liveActivities!.sync).mock.calls;
  expect(JSON.parse(calls[0][1]!).phase).toBe("waiting");
  expect(JSON.parse(calls[1][1]!).phase).toBe("onShift");

  await act(() => {
    useLiveActivityDebug.setState({ mode: "waiting", revision: 3 });
  });
  await waitFor(() => expect(liveActivities?.sync).toHaveBeenCalledTimes(3));
  expect(liveActivities?.stop).toHaveBeenCalledTimes(stopped);
  expect(
    JSON.parse(jest.mocked(liveActivities!.sync).mock.calls[2][1]!).phase,
  ).toBe("waiting");
});
