import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  registeredTeam: { findUnique: vi.fn() },
  slackWorkspace: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    findFirstOrThrow: vi.fn(),
  },
  slackSubscription: { deleteMany: vi.fn(), upsert: vi.fn() },
  get: vi.fn(),
  del: vi.fn(),
  setEx: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: db.get, del: db.del, setEx: db.setEx },
}));
import { onboardingRedirect } from "../src/handler/slack/onboardingRedirect.js";
import { addSlackWorkspace } from "../src/handler/slack/addSlackWorkspace.js";
import { processCommand } from "../src/handler/slack/processCommands.js";
import { processEvent } from "../src/handler/slack/processEvents.js";
import { sendSlackVerification } from "../src/handler/manager/sendSlackVerification.js";
const state = "a".repeat(32);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", db.fetch);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  db.get.mockResolvedValue("code");
  db.slackWorkspace.findFirstOrThrow.mockResolvedValue({ owner: 8033 });
  db.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      access_token: "synthetic-token",
      team: { id: "workspace", name: "Test" },
      bot_user_id: "bot",
      authed_user: { id: "user" },
    }),
  });
  vi.stubEnv("SLACK_WEBHOOK", "https://example.invalid/webhook");
  vi.stubEnv("BASE_URL", "https://example.invalid");
  vi.stubEnv("SLACK_CLIENT_ID", "client");
  vi.stubEnv("SLACK_CLIENT_SECRET", "synthetic-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each(["development", "production"])(
  "creates an expiring OAuth state and redirects with the correct client (%s)",
  async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const result = await invoke(onboardingRedirect, {
      query: { team_code: "code" },
    });
    expect(result.statusCode).toBe(302);
    const url = new URL(result.headers.Location);
    const value = url.searchParams.get("state")!;
    expect(value).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(url.searchParams.get("client_id")).toBe(
      environment === "development"
        ? "645725051604.9558878384433"
        : "645725051604.9455262680016",
    );
    expect(db.setEx).toHaveBeenCalledWith(`slack:oauth:${value}`, "code", 600);
  },
);
it("rejects unknown team codes before creating OAuth states", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(onboardingRedirect, { query: { team_code: "unknown" } }))
      .statusCode,
  ).toBe(404);
  expect(db.setEx).not.toHaveBeenCalled();
});
it("reports malformed OAuth onboarding", async () => {
  expect((await invoke(onboardingRedirect)).statusCode).toBe(500);
});
it("consumes state before exchanging the code and upserts the team-owned workspace", async () => {
  const result = await invoke(addSlackWorkspace, {
    query: { code: "authorization-code", state },
  });
  expect(result.statusCode).toBe(302);
  expect(db.get).toHaveBeenCalledWith(`slack:oauth:${state}`);
  expect(db.del).toHaveBeenCalledWith(`slack:oauth:${state}`);
  expect(db.del.mock.invocationCallOrder[0]).toBeLessThan(
    db.fetch.mock.invocationCallOrder[0],
  );
  const body = db.fetch.mock.calls[0][1].body as FormData;
  expect(body.get("code")).toBe("authorization-code");
  expect(body.get("redirect_uri")).toBe(
    "https://example.invalid/v1/slack/add-workspace",
  );
  const fields = {
    name: "Test",
    authToken: "synthetic-token",
    botUserId: "bot",
    authUserId: "user",
    owner: 8033,
  };
  expect(db.slackWorkspace.upsert).toHaveBeenCalledWith({
    where: { workspaceId: "workspace" },
    update: fields,
    create: { workspaceId: "workspace", ...fields },
  });
});
it.each([null, 42, ""])(
  "rejects absent or malformed OAuth state (%s)",
  async (value) => {
    db.get.mockResolvedValue(value);
    expect(
      (
        await invoke(addSlackWorkspace, {
          query: { code: "authorization-code", state },
        })
      ).statusCode,
    ).toBe(400);
    expect(db.fetch).not.toHaveBeenCalled();
  },
);
it("rejects a team removed during OAuth", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect(
    (
      await invoke(addSlackWorkspace, {
        query: { code: "authorization-code", state },
      })
    ).statusCode,
  ).toBe(404);
  expect(db.slackWorkspace.upsert).not.toHaveBeenCalled();
});
it("reports malformed OAuth input and responses", async () => {
  expect((await invoke(addSlackWorkspace)).statusCode).toBe(500);
  db.fetch.mockResolvedValue({ json: async () => ({ ok: false }) });
  expect(
    (
      await invoke(addSlackWorkspace, {
        query: { code: "authorization-code", state },
      })
    ).statusCode,
  ).toBe(500);
});
const command = (text: string) =>
  invoke(processCommand, {
    body: {
      command: "/lovat",
      text,
      channel_id: "channel",
      team_id: "workspace",
      api_app_id: "app",
    },
  });
it("returns Slack command help", async () => {
  expect((await command("help")).body).toContain("setup guide");
});
for (const action of ["subscribe", "unsubscribe"]) {
  it(`${action} requires a workspace team`, async () => {
    db.slackWorkspace.findFirstOrThrow.mockResolvedValue({ owner: null });
    expect((await command(action)).body).toContain("set your team number");
    expect(db.slackSubscription.upsert).not.toHaveBeenCalled();
    expect(db.slackSubscription.deleteMany).not.toHaveBeenCalled();
  });
  it.each([action, `${action} break`])(
    `${action} manages break subscriptions (%s)`,
    async (text) => {
      expect((await command(text)).body).toContain("'break' notifications");
      const fields = {
        channelId: "channel",
        workspaceId: "workspace",
        subscribedEvent: "BREAK",
      };
      if (action === "subscribe")
        expect(db.slackSubscription.upsert).toHaveBeenCalledWith({
          where: { subscriptionId: "channel_B" },
          update: fields,
          create: { subscriptionId: "channel_B", ...fields },
        });
      else
        expect(db.slackSubscription.deleteMany).toHaveBeenCalledWith({
          where: fields,
        });
    },
  );
  it(`${action} handles the legacy no-leave argument without a break mutation`, async () => {
    expect((await command(`${action} no-leave`)).statusCode).toBe(200);
    expect(db.slackSubscription.upsert).not.toHaveBeenCalled();
    expect(db.slackSubscription.deleteMany).not.toHaveBeenCalled();
  });
  it(`${action} rejects unknown options`, async () => {
    expect((await command(`${action} unknown`)).body).toContain(
      "not a valid argument",
    );
  });
}
it("rejects unrecognized commands and invalid payloads", async () => {
  expect((await command("unknown")).statusCode).toBe(400);
  expect((await invoke(processCommand)).statusCode).toBe(500);
});
it("reports workspace lookup failure", async () => {
  db.slackWorkspace.findFirstOrThrow.mockRejectedValue(new Error("offline"));
  expect((await command("subscribe")).statusCode).toBe(500);
});
it.each(["app_uninstalled", "channel_deleted"])(
  "processes Slack lifecycle event %s",
  async (type) => {
    const response = await invoke(processEvent, {
      body: {
        type: "event_callback",
        token: "synthetic-token",
        team_id: "workspace",
        api_app_id: "app",
        event: { type, channel: "channel" },
        event_id: "event",
      },
    });
    expect(response.send).toHaveBeenCalledWith("Event processed");
    if (type === "app_uninstalled")
      expect(db.slackWorkspace.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: "workspace" },
      });
    else
      expect(db.slackSubscription.deleteMany).toHaveBeenCalledWith({
        where: { channelId: "channel" },
      });
  },
);
it.each(["https://team.example.invalid", ""])(
  "sends team registration approval actions (%s website)",
  async (website) => {
    await sendSlackVerification(8033, "team@example.invalid", website);
    const [url, request] = db.fetch.mock.calls[0];
    expect(url).toBe("https://example.invalid/webhook");
    const body = JSON.parse(request.body);
    expect(body.blocks[2].text.text).toContain(website || "_None_");
    expect(
      body.blocks[3].elements.map(
        (element: { value: string }) => element.value,
      ),
    ).toEqual(["approve_8033", "reject_8033"]);
  },
);
it("does not send when the approval webhook is absent", async () => {
  vi.stubEnv("SLACK_WEBHOOK", undefined);
  await expect(
    sendSlackVerification(8033, "team@example.invalid", ""),
  ).rejects.toBe("Slack webhook doesn't exist");
  expect(db.fetch).not.toHaveBeenCalled();
});
it("propagates rejected registration approval posts", async () => {
  const response = { ok: false };
  db.fetch.mockResolvedValue(response);
  await expect(
    sendSlackVerification(8033, "team@example.invalid", ""),
  ).rejects.toBe(response);
});

it("acknowledges malformed and failing Slack events", async () => {
  expect((await invoke(processEvent)).statusCode).toBe(400);
  db.slackWorkspace.deleteMany.mockRejectedValue(new Error("offline"));
  expect(
    (
      await invoke(processEvent, {
        body: {
          type: "event_callback",
          token: "synthetic-token",
          team_id: "workspace",
          api_app_id: "app",
          event: { type: "app_uninstalled" },
          event_id: "event",
        },
      })
    ).statusCode,
  ).toBe(500);
});
it("shows help for empty commands", async () => {
  expect((await command("   ")).body).toContain("setup guide");
});
