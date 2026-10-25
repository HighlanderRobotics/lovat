import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { del, get, post, put, useUrlPrefix } from "../lib/lovatAPI/lovatAPI";
import { useScouterStore, useTeamStore } from "../lib/storage/userStores";
import { scout } from "./fixtures";

jest.mock("expo-constants", () => ({ expoConfig: { version: "26.1.0" } }));

beforeEach(async () => {
  await AsyncStorage.clear();
  useTeamStore.getState().setCode("team-code");
  useTeamStore.getState().setNumber(8033);
  useScouterStore.getState().setValue(scout);
  useUrlPrefix.getState().setUrlPrefix("https://example.test");
});
test("every request carries stable device identity and the selected scout/team; JSON writes preserve their method", async () => {
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true } as Response);
  const controller = new AbortController();
  await get("/read", { signal: controller.signal });
  await post("/write", { notes: "Synthetic" });
  await put("/change", { enabled: true });
  await del("/remove");
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    "https://example.test/read",
    "https://example.test/write",
    "https://example.test/change",
    "https://example.test/remove",
  ]);
  const first = request.mock.calls[0][1]!;
  expect(first.signal).toBe(controller.signal);
  expect(first.headers).toMatchObject({
    "X-Team-Code": "team-code",
    "X-Scouter-UUID": "scout",
    "X-OS-Name": Platform.OS,
  });
  const device = (first.headers as Record<string, string>)["X-Device-Id"];
  expect(device).toMatch(/^[a-f\d-]{36}$/);
  for (const [, options] of request.mock.calls)
    expect(options?.headers).toMatchObject({ "X-Device-Id": device });
  expect(request.mock.calls[1][1]).toMatchObject({
    method: "POST",
    body: '{"notes":"Synthetic"}',
    headers: { "Content-Type": "application/json" },
  });
  expect(request.mock.calls[2][1]?.method).toBe("PUT");
  expect(request.mock.calls[3][1]?.method).toBe("DELETE");
  expect(useUrlPrefix.getState().getIsCustom()).toBe(true);
  useUrlPrefix.getState().setUrlPrefix(null);
  expect(useUrlPrefix.getState().getIsCustom()).toBe(false);
  request.mockRestore();
});
test("requests remain valid before a scout is selected or version/OS metadata is available", async () => {
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true } as Response);
  const config = Constants.expoConfig,
    os = Platform.OS;
  Object.defineProperty(Constants, "expoConfig", {
    value: null,
    configurable: true,
  });
  Object.defineProperty(Platform, "OS", {
    value: undefined,
    configurable: true,
  });
  useScouterStore.getState().setValue(null);
  await get("/anonymous");
  const headers = request.mock.calls[0][1]?.headers as Record<string, string>;
  expect(headers).not.toHaveProperty("X-App-Version");
  expect(headers).not.toHaveProperty("X-Scouter-UUID");
  expect(headers).not.toHaveProperty("X-OS-Name");
  Object.defineProperty(Constants, "expoConfig", {
    value: config,
    configurable: true,
  });
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  request.mockRestore();
});

test("a null code from legacy persisted settings becomes an empty request header", async () => {
  useTeamStore.setState({ code: null as unknown as string });
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true } as Response);
  await get("/legacy");
  expect(request.mock.calls[0][1]?.headers).toMatchObject({
    "X-Team-Code": "",
  });
  request.mockRestore();
});
