import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import Button from "../../lib/components/Button";
import { GameTimer } from "../../lib/collection/ui/GameTimer";

beforeEach(() => {
  jest.useFakeTimers();
});

test("timer crosses minute boundaries, resets and releases its interval", async () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  const intervalSpy = jest.spyOn(global, "setInterval");
  const clearSpy = jest.spyOn(global, "clearInterval");
  const view = await render(<GameTimer />);
  expect(screen.getByText("0:00")).toBeOnTheScreen();
  await view.rerender(<GameTimer startTime={new Date(1000)} />);
  await act(async () => {
    jest.advanceTimersByTime(61_000);
  });
  expect(screen.getByText("1:01")).toBeOnTheScreen();
  await view.rerender(<GameTimer />);
  expect(screen.getByText("0:00")).toBeOnTheScreen();
  await view.unmount();
  expect(clearSpy).toHaveBeenCalled();
  expect(intervalSpy).toHaveBeenCalledTimes(1);
});
test("button prevents duplicate submission while pending and permits retry after failure", async () => {
  let reject!: (error: Error) => void;
  const submit = jest.fn(
    () =>
      new Promise<void>((_, r) => {
        reject = r;
      }),
  );
  await render(
    <Button onPress={submit} loadingChildren="Saving">
      Save
    </Button>,
  );
  await fireEvent.press(screen.getByText("Save"));
  expect(screen.getByText("Saving")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Saving"));
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error("Offline. Retry."));
  });
  expect(screen.getByText("Offline. Retry.")).toBeOnTheScreen();
  expect(screen.getByText("Save")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Save"));
  expect(submit).toHaveBeenCalledTimes(2);
});
test("disabled action does not invoke submission", async () => {
  const submit = jest.fn<() => void>();
  await render(
    <Button disabled onPress={submit}>
      Save
    </Button>,
  );
  await fireEvent.press(screen.getByText("Save"));
  expect(submit).not.toHaveBeenCalled();
});
