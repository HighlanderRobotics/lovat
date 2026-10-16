import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { registeredTeam: { findUnique: mocks.findUnique } },
}));
const { requireVerifiedTeam } =
  await import("../src/lib/middleware/requireVerifiedTeam.js");

const check = (teamNumber?: number | null) => {
  const app = express();
  app.use((req: AuthenticatedRequest, _res, next) => {
    if (teamNumber !== undefined)
      req.user = { teamNumber } as AuthenticatedRequest["user"];
    next();
  });
  app.get("/protected", requireVerifiedTeam, (_req, res) =>
    res.json({ allowed: true }),
  );
  return request(app).get("/protected");
};

describe("verified team access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue(null);
    mocks.findUnique.mockResolvedValue({ emailVerified: false });
  });

  it.each([undefined, null])(
    "rejects a missing team (%s) before looking up verification",
    async (team) => {
      expect((await check(team)).status).toBe(401);
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.findUnique).not.toHaveBeenCalled();
    },
  );

  it("uses cached verification without a database query", async () => {
    mocks.get.mockResolvedValue("verified");
    expect((await check(8033)).body).toEqual({ allowed: true });
    expect(mocks.get).toHaveBeenCalledWith("auth:team:8033");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("caches a verified team after the database lookup", async () => {
    mocks.findUnique.mockResolvedValue({ emailVerified: true });
    expect((await check(8033)).status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { number: 8033 } });
    expect(mocks.set).toHaveBeenCalledWith("auth:team:8033", "verified");
  });

  it.each([null, { emailVerified: false }])(
    "denies an unknown or unverified team (%j)",
    async (row) => {
      mocks.findUnique.mockResolvedValue(row);
      expect((await check(8033)).status).toBe(403);
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );

  it.each(["cache", "database", "cache write"])(
    "does not allow access after a %s failure",
    async (failure) => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      if (failure === "cache")
        mocks.get.mockRejectedValue(new Error("offline"));
      if (failure === "database")
        mocks.findUnique.mockRejectedValue(new Error("offline"));
      if (failure === "cache write") {
        mocks.findUnique.mockResolvedValue({ emailVerified: true });
        mocks.set.mockRejectedValue(new Error("offline"));
      }
      expect((await check(8033)).status).toBe(500);
      log.mockRestore();
    },
  );
});
