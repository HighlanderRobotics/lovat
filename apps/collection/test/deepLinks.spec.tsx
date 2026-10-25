import React from "react";
import { Alert } from "react-native";
import { render, screen } from "@testing-library/react-native";
import {
  router,
  useGlobalSearchParams,
  useLocalSearchParams,
} from "expo-router";
import SetURL from "../app/set-url/index";
import Details from "../app/history/[uuid]";
import { useUrlPrefix } from "../lib/lovatAPI/lovatAPI";
import { useHistoryStore } from "../lib/storage/historyStore";

it.each([
  undefined,
  "",
  ["https://one.test", "https://two.test"],
  "https://api.example.test",
])("API URL links handle parameter %j safely", (u) => {
  jest.mocked(useGlobalSearchParams).mockReturnValue({ u: u as string });
  useUrlPrefix.getState().setUrlPrefix(null);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<SetURL />);
  if (typeof u === "string" && u) {
    expect(useUrlPrefix.getState().getUrlPrefix()).toBe(u);
    expect(alert).toHaveBeenCalledWith("API URL updated", expect.any(String));
  } else expect(alert).not.toHaveBeenCalled();
  expect(router.back).toHaveBeenCalled();
  alert.mockRestore();
});
test("a stale report link returns to history instead of crashing", () => {
  useHistoryStore.setState({ history: [] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ uuid: "deleted" });
  render(<Details />);
  expect(screen.toJSON()).toBeNull();
  expect(router.replace).toHaveBeenCalledWith("/history");
});
