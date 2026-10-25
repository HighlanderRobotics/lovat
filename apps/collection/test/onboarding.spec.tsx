import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import TeamCode from "../app/onboarding/team-code";
import Name from "../app/onboarding/name";
import { router } from "expo-router";
import { checkTeamCode } from "../lib/lovatAPI/checkTeamCode";
import { addScouter } from "../lib/lovatAPI/addScouter";
import { useTeamStore, useScouterStore } from "../lib/storage/userStores";
import { useTeamScoutersStore } from "../lib/services";
import { TextInput } from "react-native";
import { scout } from "./fixtures";
jest.mock("../lib/lovatAPI/checkTeamCode", () => ({
  checkTeamCode: jest.fn(),
}));
jest.mock("../lib/lovatAPI/addScouter", () => ({ addScouter: jest.fn() }));
jest.mock("../lib/lovatAPI/getTeamScouters", () => ({
  getTeamScouters: jest.fn(async () => []),
}));
test("team code entry normalizes case and handles validation errors before saving", async () => {
  jest
    .mocked(checkTeamCode)
    .mockRejectedValueOnce(new Error("Bad code"))
    .mockRejectedValueOnce("invalid response")
    .mockResolvedValueOnce({
      number: 8033,
      code: "ABC",
      email: "",
      emailVerified: true,
      teamApproved: true,
      website: null,
    });
  render(<TeamCode />);
  fireEvent.changeText(screen.getByPlaceholderText("Code"), "abc");
  fireEvent.press(screen.getByText("Next"));
  await screen.findByText("Bad code");
  fireEvent.press(screen.getByText("Next"));
  await screen.findByText("An unknown error occurred");
  fireEvent.changeText(screen.getByPlaceholderText("Code"), "valid");
  fireEvent.press(screen.getByText("Next"));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith("onboarding/name"),
  );
  expect(useTeamStore.getState().code).toBe("VALID");
  expect(useTeamStore.getState().number).toBe(8033);
});
test("scouts can search existing names or create a new name; both creation errors stay visible", async () => {
  const fetch = jest
    .spyOn(useTeamScoutersStore.getState(), "fetchData")
    .mockResolvedValue(undefined);
  useTeamScoutersStore.setState({ data: null });
  render(<Name />);
  await act(async () => {
    useTeamScoutersStore.setState({ data: [scout] });
  });
  fireEvent.press(screen.getByText("Alex"));
  expect(useScouterStore.getState().value?.uuid).toBe(scout.uuid);
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "Taylor");
  jest
    .mocked(addScouter)
    .mockRejectedValueOnce(new Error("Save failed"))
    .mockRejectedValueOnce(null)
    .mockResolvedValueOnce({ ...scout, uuid: "new", name: "Taylor" });
  fireEvent.press(screen.getByText("Create new scouter"));
  await screen.findByText("Save failed");
  fireEvent.press(screen.getByText("Create new scouter"));
  await screen.findByText("An unknown error occurred");
  fireEvent.press(screen.getByText("Create new scouter"));
  await waitFor(() =>
    expect(useScouterStore.getState().value?.uuid).toBe("new"),
  );
  fetch.mockRestore();
});

import Button from "../lib/components/Button";
test("duplicate native submit callbacks cannot submit a team code twice", async () => {
  let finish: (
    value: Awaited<ReturnType<typeof checkTeamCode>>,
  ) => void = () => {};
  jest.mocked(checkTeamCode).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<TeamCode />);
  fireEvent.changeText(screen.getByPlaceholderText("Code"), "test");
  fireEvent.press(screen.getByText("Next"));
  await waitFor(() => expect(screen.getByText("Next")).toBeDisabled());
  await act(async () => {
    await screen.UNSAFE_getByType(Button).props.onPress();
  });
  expect(checkTeamCode).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish({
      number: 8033,
      code: "TEST",
      email: "",
      emailVerified: true,
      teamApproved: true,
      website: null,
    }),
  );
});
test("duplicate name creation callbacks cannot add the scout twice", async () => {
  let finish: (value: typeof scout) => void = () => {};
  const fetch = jest
    .spyOn(useTeamScoutersStore.getState(), "fetchData")
    .mockResolvedValue(undefined);
  useTeamScoutersStore.setState({ data: [] });
  jest.mocked(addScouter).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Name />);
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "Taylor");
  fireEvent.press(screen.getByText("Create new scouter"));
  await waitFor(() =>
    expect(screen.getByText("Create new scouter")).toBeDisabled(),
  );
  await act(async () => {
    await screen.UNSAFE_getByType(Button).props.onPress();
  });
  expect(addScouter).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ...scout, name: "Taylor" }));
  fetch.mockRestore();
});
it.each([new Error("Could not save scout"), null])(
  "selecting a scout handles a settings write failure %s",
  async (failure) => {
    const fetch = jest
      .spyOn(useTeamScoutersStore.getState(), "fetchData")
      .mockResolvedValue(undefined);
    useTeamScoutersStore.setState({ data: [scout] });
    const save = jest
      .spyOn(useScouterStore.getState(), "setValue")
      .mockImplementation(() => {
        throw failure;
      });
    render(<Name />);
    fireEvent.press(screen.getByText("Alex"));
    expect(
      screen.getByText(
        failure instanceof Error
          ? failure.message
          : "An unknown error occurred",
      ),
    ).toBeTruthy();
    save.mockRestore();
    fetch.mockRestore();
  },
);
