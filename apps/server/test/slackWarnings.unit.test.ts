import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WarningType } from "@lovat/db";
const db = vi.hoisted(() => ({
  teamMatchData: { findMany: vi.fn() },
  slackSubscription: { findMany: vi.fn() },
  scoutReport: { findUnique: vi.fn() },
  slackNotificationThread: { findFirst: vi.fn(), create: vi.fn() },
  post: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("@slack/web-api", () => ({
  WebClient: class {
    chat = { postMessage: db.post };
  },
}));
import { sendWarningToSlack } from "../src/handler/slack/sendWarningNotification.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.teamMatchData.findMany
    .mockResolvedValueOnce([
      { matchNumber: 2, key: "q2_0" },
      { matchNumber: 3, key: "q3_3" },
      { matchNumber: 5, key: "q5_0" },
    ])
    .mockResolvedValueOnce([
      { teamNumber: 8033, matchNumber: 2, key: "q2_1" },
      { teamNumber: 8033, matchNumber: 5, key: "q5_1" },
      { teamNumber: 971, matchNumber: 2, key: "q2_4" },
      { teamNumber: 971, matchNumber: 3, key: "q3_4" },
      { teamNumber: 999, matchNumber: 3, key: "q3_1" },
      { teamNumber: 888, matchNumber: 99, key: "q99_0" },
    ]);
  db.slackSubscription.findMany.mockResolvedValue([
    { channelId: "own", workspace: { owner: 8033, authToken: "synthetic" } },
    {
      channelId: "external",
      workspace: { owner: 971, authToken: "synthetic" },
    },
  ]);
  db.scoutReport.findUnique.mockResolvedValue({
    scouter: { sourceTeamNumber: 8033, name: "  Scout  " },
    robotBrokeDescription: "Broken wheel",
  });
  db.slackNotificationThread.findFirst.mockResolvedValue(null);
  db.post.mockResolvedValue({ ts: "message" });
});
afterEach(() => vi.restoreAllMocks());
it("notifies upcoming alliance partners and creates properly keyed threads", async () => {
  await sendWarningToSlack(WarningType.BREAK, 1, 254, "2026test", "report");
  expect(db.slackSubscription.findMany).toHaveBeenCalledWith({
    where: {
      workspace: { team: { number: { in: [8033, 971] } } },
      subscribedEvent: "BREAK",
    },
    include: { workspace: true },
  });
  expect(db.post).toHaveBeenCalledWith({
    channel: "own",
    text: expect.stringContaining(
      "*Scout* reported your alliance partner in *Q2*",
    ),
  });
  expect(db.post).toHaveBeenCalledWith({
    channel: "external",
    text: expect.stringContaining(
      "*A Scouter from team 8033* reported your alliance partner in *Q3*",
    ),
  });
  expect(db.slackNotificationThread.create).toHaveBeenCalledWith({
    data: {
      messageId: "message",
      channelId: "own",
      subscriptionId: "own_B",
      matchNumber: 1,
      teamNumber: 254,
    },
  });
});
it.each([null, "   ", "Broken wheel"])(
  "threads later observations and handles missing reasons (%s)",
  async (description) => {
    db.slackNotificationThread.findFirst.mockResolvedValue({
      messageId: "existing",
    });
    db.scoutReport.findUnique.mockResolvedValue({
      scouter: { sourceTeamNumber: 8033, name: "Scout" },
      robotBrokeDescription: description,
    });
    await sendWarningToSlack(WarningType.BREAK, 1, 254, "2026test", "report");
    expect(db.post).toHaveBeenCalledWith({
      channel: "own",
      thread_ts: "existing",
      text: expect.stringContaining(
        description?.trim() ? `> ${description}` : "> no reason specified",
      ),
    });
    expect(db.slackNotificationThread.create).not.toHaveBeenCalled();
  },
);
it.each([null, "   "])(
  "uses a fallback reason for new threads (%s)",
  async (description) => {
    db.scoutReport.findUnique.mockResolvedValue({
      scouter: { sourceTeamNumber: 8033, name: "Scout" },
      robotBrokeDescription: description,
    });
    await sendWarningToSlack(WarningType.BREAK, 1, 254, "2026test", "report");
    expect(db.post).toHaveBeenCalledWith({
      channel: "own",
      text: expect.stringContaining("> no reason specified"),
    });
  },
);
it("still sends warnings when the owning-team scouter has no name", async () => {
  db.scoutReport.findUnique.mockResolvedValue({
    scouter: { sourceTeamNumber: 8033, name: null },
    robotBrokeDescription: null,
  });
  await sendWarningToSlack(WarningType.BREAK, 1, 254, "2026test", "report");
  expect(db.post).toHaveBeenCalledTimes(2);
});
it("uses a generic upcoming-match label for unexpected subscription data", async () => {
  db.slackSubscription.findMany.mockResolvedValue([
    {
      channelId: "unexpected",
      workspace: { owner: 888, authToken: "synthetic" },
    },
  ]);
  await sendWarningToSlack(WarningType.BREAK, 1, 254, "2026test", "report");
  expect(db.post).toHaveBeenCalledWith({
    channel: "unexpected",
    text: expect.stringContaining("*an upcoming match*"),
  });
});
it("logs infrastructure failures without rejecting report ingestion", async () => {
  db.teamMatchData.findMany.mockReset().mockRejectedValue(new Error("offline"));
  await expect(
    sendWarningToSlack(WarningType.BREAK, 1, 254, "2026test", "report"),
  ).resolves.toBeUndefined();
  expect(console.error).toHaveBeenCalledWith(expect.any(Error));
});
