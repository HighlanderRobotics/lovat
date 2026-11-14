import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { buildActivityState } from "../src/liveActivities/state.js";

const mocks = vi.hoisted(() => ({
  records: new Map<string, string>(),
  ready: vi.fn(() => true),
  state: vi.fn(),
  send: vi.fn(),
}));
vi.mock("../src/redisClient.js", () => ({
  kv: {
    async *keys() {
      yield* mocks.records.keys();
    },
    get: async (key: string) => mocks.records.get(key) ?? null,
    setEx: async (key: string, value: string) => {
      mocks.records.set(key, value);
    },
    del: async (key: string) => {
      mocks.records.delete(key);
    },
  },
}));
vi.mock("../src/liveActivities/schedule.js", () => ({
  scoutingActivityState: mocks.state,
}));
vi.mock("../src/liveActivities/apns.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/liveActivities/apns.js")>()),
  backgroundActivitiesReady: mocks.ready,
  sendActivityPush: mocks.send,
}));
const { refreshLiveActivities } =
  await import("../src/liveActivities/subscriptions.js");
const state = buildActivityState(
  [
    {
      ordinal: 28,
      matchKey: "q28",
      matchLabel: "Q28",
      complete: false,
      assignment: { teamNumber: 8433, submitted: false },
      startTime: null,
    },
  ],
  "Test",
)!;
const key = "live-activity:device";
const record = () => ({
  installationId: "device",
  sourceTeamNumber: 8033,
  scouterUuid: "scout",
  tournamentKey: "event",
  environment: "sandbox",
  updateToken: "update-token",
  expiresAt: Date.now() + 100000,
  lastState: state,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.ready.mockReturnValue(true);
  mocks.state.mockResolvedValue(state);
  mocks.send.mockResolvedValue(200);
  mocks.records.set(key, JSON.stringify(record()));
});
afterEach(() => vi.restoreAllMocks());

it("updates the correct device and scout while the app is closed", async () => {
  await refreshLiveActivities();
  expect(mocks.state).toHaveBeenCalledWith(8033, "scout", "event");
  expect(mocks.send).toHaveBeenCalledWith(
    "update-token",
    "sandbox",
    expect.objectContaining({
      aps: expect.objectContaining({ event: "update", "content-state": state }),
    }),
  );
});

it("ends completed shifts and removes their device registration", async () => {
  mocks.state.mockResolvedValue(null);
  await refreshLiveActivities();
  expect(mocks.send.mock.calls[0][2].aps.event).toBe("end");
  expect(mocks.records.has(key)).toBe(false);
});

it("starts an activity once using the push-to-start token", async () => {
  mocks.records.set(
    key,
    JSON.stringify({
      ...record(),
      updateToken: undefined,
      startToken: "start-token",
      mascotStyle: "outlined",
    }),
  );
  await refreshLiveActivities();
  await refreshLiveActivities();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0]).toBe("start-token");
  expect(mocks.send.mock.calls[0][2].aps.event).toBe("start");
  expect(mocks.send.mock.calls[0][2].aps.attributes.mascotStyle).toBe(
    "outlined",
  );
});

it("does not repeatedly push an unchanged state before the heartbeat", async () => {
  await refreshLiveActivities();
  await refreshLiveActivities();
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it("removes invalid APNs tokens without retaining private token logs", async () => {
  mocks.send.mockResolvedValue(410);
  await refreshLiveActivities();
  expect(mocks.records.has(key)).toBe(false);
});

it("retains transient delivery failures for a later retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.send.mockResolvedValue(503);
  await refreshLiveActivities();
  expect(mocks.records.has(key)).toBe(true);
});

it("does not overwrite a token rotation received during an APNs request", async () => {
  mocks.send.mockImplementation(async () => {
    mocks.records.set(
      key,
      JSON.stringify({ ...record(), updateToken: "rotated-token" }),
    );
    return 200;
  });
  await refreshLiveActivities();
  expect(JSON.parse(mocks.records.get(key)!).updateToken).toBe("rotated-token");
});

it("does not send pushes without server credentials", async () => {
  mocks.ready.mockReturnValue(false);
  await refreshLiveActivities();
  expect(mocks.send).not.toHaveBeenCalled();
});
