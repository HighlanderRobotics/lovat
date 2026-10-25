import {
  createGenericServiceStore,
  getServiceLoader,
  useScouterScheduleStore,
  useTeamScoutersStore,
  useTournamentsStore,
  useServicesLoadingStore,
  useServiceErrorStore,
} from "../lib/services";
import { getScouterSchedule } from "../lib/lovatAPI/getScouterSchedule";
import { getTeamScouters } from "../lib/lovatAPI/getTeamScouters";
import { getTournaments } from "../lib/lovatAPI/getTournaments";
import { useMatchScheduleStore } from "../lib/storage/matchScheduleStore";
import { useCustomPostMatchStore } from "../lib/storage/customPostMatchStore";
import { useConnectivityStore } from "../lib/network/connectivity";
import { scout, tournament } from "./fixtures";
jest.mock("../lib/lovatAPI/getScouterSchedule", () => ({
  getScouterSchedule: jest.fn(),
}));
jest.mock("../lib/lovatAPI/getTeamScouters", () => ({
  getTeamScouters: jest.fn(),
}));
jest.mock("../lib/lovatAPI/getTournaments", () => ({
  getTournaments: jest.fn(),
}));
afterEach(() => jest.restoreAllMocks());
test("service loading refreshes every source, including when one fails, and always clears loading", async () => {
  jest.mocked(getScouterSchedule).mockResolvedValue(undefined);
  jest.mocked(getTeamScouters).mockResolvedValue([scout]);
  jest.mocked(getTournaments).mockResolvedValue([tournament]);
  const full = jest
    .spyOn(useMatchScheduleStore.getInitialState(), "fetchData")
    .mockResolvedValue(undefined);
  const custom = jest
    .spyOn(useCustomPostMatchStore.getState(), "fetchData")
    .mockResolvedValue(undefined);
  useConnectivityStore.setState({ status: "online" });
  await getServiceLoader()();
  expect(useServicesLoadingStore.getState().value).toBe(false);
  expect(useServiceErrorStore.getState().value).toBeNull();
  expect(full).toHaveBeenCalledTimes(1);
  expect(custom).toHaveBeenCalledTimes(1);
  expect(useTeamScoutersStore.getState().data).toEqual([scout]);
  expect(useTournamentsStore.getState().data).toEqual([tournament]);
  expect(useScouterScheduleStore.getState().timestamp).not.toBeNull();
  const failure = new Error("Schedule down");
  jest.mocked(getScouterSchedule).mockRejectedValue(failure);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  await getServiceLoader()();
  expect(log).toHaveBeenCalledWith(failure);
  expect(useServiceErrorStore.getState().value).toBe("{}");
  expect(full).toHaveBeenCalledTimes(2);
  expect(useServicesLoadingStore.getState().value).toBe(false);
  useConnectivityStore.setState({ status: "offline" });
  await getServiceLoader()();
  expect(full).toHaveBeenCalledTimes(2);
});
test("generic persisted services timestamp successful responses and preserve data after a rejected refresh", async () => {
  const fetch = jest.fn().mockResolvedValue(["first"]);
  const store = createGenericServiceStore<string[]>(fetch, "synthetic-service");
  await store.getState().fetchData();
  expect(store.getState().data).toEqual(["first"]);
  expect(store.getState().timestamp).toEqual(expect.any(Number));
  fetch.mockRejectedValue(new Error("Offline"));
  await expect(store.getState().fetchData()).rejects.toThrow("Offline");
  expect(store.getState().data).toEqual(["first"]);
});
