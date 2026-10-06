import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  apiKey: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import { addApiKey } from "../src/handler/manager/apikey/addApiKey.js";
import { getApiKeys } from "../src/handler/manager/apikey/getApiKeys.js";
import { renameApiKey } from "../src/handler/manager/apikey/renameApiKey.js";
import { revokeApiKey } from "../src/handler/manager/apikey/revokeApiKey.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.apiKey.findMany.mockResolvedValue([{ uuid: "key", name: "Synthetic" }]);
  db.apiKey.findFirst.mockResolvedValue({ user: { ...testUser, id: "other" } });
});
afterEach(() => vi.restoreAllMocks());
it("returns a new random API token while persisting only its digest", async () => {
  const result = await invoke(addApiKey, { query: { name: "Test" } });
  const { apiKey } = result.body as { apiKey: string };
  expect(apiKey).toMatch(/^lvt-[a-f0-9]{64}$/);
  expect(db.apiKey.create).toHaveBeenCalledWith({
    data: {
      name: "Test",
      userId: testUser.id,
      keyHash: createHash("sha256").update(apiKey).digest("hex"),
    },
  });
});
it("rejects invalid token creation requests", async () => {
  expect((await invoke(addApiKey)).statusCode).toBe(400);
});
it("does not allow API tokens to create other tokens", async () => {
  expect((await invoke(addApiKey, { tokenType: "apiKey" })).statusCode).toBe(
    403,
  );
  expect(db.apiKey.create).not.toHaveBeenCalled();
});
it("reports failed token persistence", async () => {
  db.apiKey.create.mockRejectedValue(new Error("database"));
  expect(
    (await invoke(addApiKey, { query: { name: "Test" } })).statusCode,
  ).toBe(500);
});
it.each([
  [testUser, { teamNumber: 8033 }],
  [{ ...testUser, role: "ANALYST" as const }, { id: testUser.id }],
  [{ ...testUser, teamNumber: null }, { id: testUser.id }],
])(
  "lists only tokens within the user's permissions %j",
  async (user, where) => {
    expect((await invoke(getApiKeys, { user })).body).toEqual({
      apiKeys: [{ uuid: "key", name: "Synthetic" }],
    });
    expect(db.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: where } }),
    );
  },
);
it("reports token listing failures", async () => {
  db.apiKey.findMany.mockRejectedValue(new Error("database"));
  expect((await invoke(getApiKeys)).statusCode).toBe(500);
});
for (const [handler, method, query] of [
  [renameApiKey, "update", { uuid: "key", newName: "Renamed" }],
  [revokeApiKey, "delete", { uuid: "key" }],
] as const) {
  it(`${method} permits a team lead to manage teammate tokens`, async () => {
    expect((await invoke(handler, { query })).statusCode).toBe(200);
    expect(db.apiKey[method]).toHaveBeenCalledWith(
      method === "update"
        ? { where: { uuid: "key" }, data: { name: "Renamed" } }
        : { where: { uuid: "key" } },
    );
  });
  it(`${method} permits an analyst to manage their own token`, async () => {
    db.apiKey.findFirst.mockResolvedValue({ user: testUser });
    expect(
      (await invoke(handler, { query, user: { ...testUser, role: "ANALYST" } }))
        .statusCode,
    ).toBe(200);
  });
  it.each([
    [{ ...testUser, role: "ANALYST" as const }, 8033],
    [testUser, 971],
    [{ ...testUser, teamNumber: null }, null],
  ])(
    `${method} rejects unauthorized token mutations %j`,
    async (user, teamNumber) => {
      db.apiKey.findFirst.mockResolvedValue({
        user: { ...testUser, id: "other", teamNumber },
      });
      expect((await invoke(handler, { query, user })).statusCode).toBe(403);
      expect(db.apiKey[method]).not.toHaveBeenCalled();
    },
  );
  it(`${method} rejects API-key authentication`, async () => {
    expect(
      (await invoke(handler, { query, tokenType: "apiKey" })).statusCode,
    ).toBe(403);
  });
  it(`${method} validates query parameters`, async () => {
    expect((await invoke(handler)).statusCode).toBe(400);
  });
  it(`${method} returns not found for a deleted token`, async () => {
    db.apiKey.findFirst.mockResolvedValue(null);
    expect((await invoke(handler, { query })).statusCode).toBe(404);
  });
  it(`${method} reports unexpected database failures`, async () => {
    db.apiKey[method].mockRejectedValue(new Error("database"));
    expect((await invoke(handler, { query })).statusCode).toBe(500);
  });
}
