import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";
import { testUser } from "./helpers/handlerHarness.js";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  getVerifiedTeam: vi.fn(),
  authenticatedUser: vi.fn<() => AuthenticatedRequest["user"]>(),
  reportError: vi.fn(),
}));

vi.mock("../src/prismaClient.js", () => ({
  default: {
    user: { findUnique: mocks.findUnique, findMany: mocks.findMany },
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.getVerifiedTeam },
}));

vi.mock("../src/lib/middleware/requireAuth.js", () => ({
  requireAuth: (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    req.user = mocks.authenticatedUser();
    next();
  },
}));

// Keep telemetry offline while exercising its position in the real app stack.
vi.mock("../src/posthogClient.js", () => ({
  posthog: { captureException: mocks.reportError },
}));
vi.mock("../src/lib/middleware/posthogMiddleware.js", () => ({
  default: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

process.env.DOTENV_CONFIG_PATH = "/dev/null";
process.env.DATABASE_URL =
  "postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test";

const { app } = await import("../src/app.js");

beforeEach(() => {
  mocks.authenticatedUser.mockReturnValue({ ...testUser });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("reports a failed profile lookup and returns safe JSON through the real app", async () => {
  const failure = new Error("private database connection details");
  mocks.findUnique.mockRejectedValueOnce(failure);
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await request(app)
    .get("/v1/manager/profile")
    .set("X-Lovat-Error-Format", "json-v1");

  expect(mocks.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: testUser.id } }),
  );
  expect(response.status).toBe(500);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(response.body).toEqual({
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    displayError: "Internal server error",
  });
  expect(response.text).not.toContain(failure.message);
  expect(mocks.reportError).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: "Internal server error" }),
    undefined,
    { method: "GET", code: "INTERNAL_SERVER_ERROR" },
  );
  expect(log).toHaveBeenCalledExactlyOnceWith(
    "Unexpected failure",
    expect.objectContaining({ name: "Error" }),
  );
  expect(JSON.stringify(mocks.reportError.mock.calls)).not.toContain(
    failure.message,
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
});

it("still returns and logs the request failure when telemetry throws", async () => {
  mocks.findUnique.mockRejectedValueOnce(new Error("private database details"));
  mocks.reportError.mockImplementationOnce(() => {
    throw new Error("private telemetry details");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await request(app)
    .get("/v1/manager/profile")
    .set("X-Lovat-Error-Format", "json-v1");

  expect(response.status).toBe(500);
  expect(response.body.displayError).toBe("Internal server error");
  expect(log).toHaveBeenCalledWith(
    "Error reporting failed",
    expect.objectContaining({ name: "Error" }),
  );
  expect(log).toHaveBeenCalledWith(
    "Unexpected failure",
    expect.objectContaining({ name: "Error" }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});

it("returns the central 403 response for an analyst on a verified team without querying analysts", async () => {
  mocks.authenticatedUser.mockReturnValue({ ...testUser, role: "ANALYST" });
  mocks.getVerifiedTeam.mockResolvedValueOnce("verified");

  const response = await request(app)
    .get("/v1/manager/analysts")
    .set("X-Lovat-Error-Format", "json-v1");

  expect(mocks.getVerifiedTeam).toHaveBeenCalledExactlyOnceWith(
    "auth:team:8033",
  );
  expect(response.status).toBe(403);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(response.body).toEqual({
    code: "SCOUTING_LEAD_REQUIRED",
    message: "Not a scouting lead",
    displayError: "Not a scouting lead",
  });
  expect(mocks.findMany).not.toHaveBeenCalled();
  expect(mocks.reportError).not.toHaveBeenCalled();
});

it("returns 413 for oversized JSON before authentication or user queries", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await request(app)
    .post("/v1/manager/notes/test-report")
    .set("X-Lovat-Error-Format", "json-v1")
    .send({ notes: "x".repeat(110 * 1024) });

  expect(response.status).toBe(413);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(response.body).toEqual({
    code: "REQUEST_TOO_LARGE",
    message: "Request body is too large",
    displayError: "Request body is too large",
  });
  expect(log).not.toHaveBeenCalled();
  expect(mocks.authenticatedUser).not.toHaveBeenCalled();
  expect(mocks.findUnique).not.toHaveBeenCalled();
  expect(mocks.findMany).not.toHaveBeenCalled();
});

it("returns 400 for malformed JSON without logging the submitted body or reaching authentication", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const invalidBody = '{"secret":"synthetic-private-value",';

  const response = await request(app)
    .post("/v1/manager/notes/test-report")
    .set("X-Lovat-Error-Format", "json-v1")
    .set("Content-Type", "application/json")
    .send(invalidBody);

  expect(response.status).toBe(400);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(response.body).toEqual({
    code: "INVALID_JSON",
    message: "Invalid JSON body",
    displayError: "Invalid JSON body",
  });
  expect(response.text).not.toContain("synthetic-private-value");
  expect(log).not.toHaveBeenCalled();
  expect(mocks.authenticatedUser).not.toHaveBeenCalled();
  expect(mocks.findUnique).not.toHaveBeenCalled();
  expect(mocks.findMany).not.toHaveBeenCalled();
});
