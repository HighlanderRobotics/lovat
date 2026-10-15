import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  decode: vi.fn(),
  userInfo: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  incr: vi.fn(),
  exp: vi.fn(),
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: mocks.verify,
  decodeJwt: mocks.decode,
}));
vi.mock("axios", () => ({ default: { get: mocks.userInfo } }));
vi.mock("../src/redisClient.js", () => ({
  kv: { incr: mocks.incr, exp: mocks.exp },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    user: { upsert: mocks.upsert, findUnique: mocks.findUnique },
    apiKey: { update: mocks.update },
  },
}));
process.env.AUTH0_DOMAIN = "auth.test.invalid";
const { requireAuth } = await import("../src/lib/middleware/requireAuth.js");
const app = express();
app.get("/protected", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ id: req.user.id, tokenType: req.tokenType });
});
const user = {
  id: "test-user",
  email: "test@example.invalid",
  role: "ANALYST",
};
const apiKey = "lvt-synthetic";
const hash = createHash("sha256").update(apiKey).digest("hex");

describe("authentication dependencies and failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.verify.mockResolvedValue({ payload: { sub: user.id } });
    mocks.decode.mockReturnValue({ sub: user.id });
    mocks.userInfo.mockResolvedValue({
      data: { email: user.email, email_verified: true },
    });
    mocks.upsert.mockResolvedValue(user);
    mocks.findUnique.mockResolvedValue(user);
    mocks.incr.mockResolvedValue(1);
    mocks.update.mockResolvedValue({ user });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([undefined, "Bearer"])(
    "rejects a missing token (%s)",
    async (header) => {
      const req = request(app).get("/protected");
      if (header) req.set("Authorization", header);
      expect((await req).status).toBe(401);
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );

  it("rejects failed JWT verification before user lookup", async () => {
    mocks.verify.mockRejectedValue(new Error("bad signature"));
    expect(
      (await request(app).get("/protected").auth("invalid", { type: "bearer" }))
        .status,
    ).toBe(401);
    expect(mocks.userInfo).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("checks issuer and audience and persists fresh Auth0 user info", async () => {
    const res = await request(app)
      .get("/protected")
      .auth("valid-jwt", { type: "bearer" });
    expect(res.body).toEqual({ id: user.id, tokenType: "jwt" });
    expect(mocks.verify).toHaveBeenCalledWith("valid-jwt", undefined, {
      issuer: "https://auth.test.invalid/",
      audience: "https://api.lovat.app",
    });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { id: user.id },
      update: { email: user.email, emailVerified: true },
      create: {
        id: user.id,
        email: user.email,
        emailVerified: true,
        role: "ANALYST",
      },
    });
  });

  it("allows a previously registered user when Auth0 user-info is offline", async () => {
    mocks.userInfo.mockRejectedValue(new Error("offline"));
    const res = await request(app)
      .get("/protected")
      .auth("valid-jwt", { type: "bearer" });
    expect(res.body).toEqual({ id: user.id, tokenType: "jwt" });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: user.id } });
  });

  it("does not authenticate an unknown user when user-info is offline", async () => {
    mocks.userInfo.mockRejectedValue(new Error("offline"));
    mocks.findUnique.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get("/protected")
          .auth("valid-jwt", { type: "bearer" })
      ).status,
    ).toBe(500);
  });

  it("hashes API keys and increments their usage without checking a JWT", async () => {
    const res = await request(app)
      .get("/protected")
      .auth(apiKey, { type: "bearer" });
    expect(res.body).toEqual({ id: user.id, tokenType: "apiKey" });
    expect(mocks.incr).toHaveBeenCalledWith(`auth:apikey:${hash}:rate`);
    expect(mocks.exp).toHaveBeenCalledWith(`auth:apikey:${hash}:rate`, 3);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { keyHash: hash },
      data: { requests: { increment: 1 } },
      include: { user: true },
    });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("stops rate-limited keys before database access", async () => {
    mocks.incr.mockResolvedValue(2);
    const res = await request(app)
      .get("/protected")
      .auth(apiKey, { type: "bearer" });
    expect(res.status).toBe(429);
    expect(res.body.retryAfterSeconds).toBe(3);
    expect(mocks.exp).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects revoked or unknown keys", async () => {
    mocks.update.mockRejectedValue(new Error("not found"));
    expect(
      (await request(app).get("/protected").auth(apiKey, { type: "bearer" }))
        .status,
    ).toBe(401);
  });

  it.each(["Redis", "user database"])(
    "fails closed when the %s is unavailable",
    async (dependency) => {
      if (dependency === "Redis")
        mocks.incr.mockRejectedValue(new Error("offline"));
      else {
        mocks.userInfo.mockRejectedValue(new Error("offline"));
        mocks.findUnique.mockRejectedValue(new Error("offline"));
      }
      const token = dependency === "Redis" ? apiKey : "valid-jwt";
      expect(
        (await request(app).get("/protected").auth(token, { type: "bearer" }))
          .status,
      ).toBe(500);
    },
  );
});
