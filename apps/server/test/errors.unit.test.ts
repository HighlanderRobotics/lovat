import express from "express";
import type { Request, Response } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, errorHandler, normalizeError } from "../src/lib/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("central error handling", () => {
  it.each(["constructor", "toString", "__proto__", "unrecognized"])(
    "treats unknown library error type %s as a generic server failure",
    (type) => {
      const failure = Object.assign(new Error("private provider details"), {
        type,
      });
      expect(normalizeError(failure)).toMatchObject({
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      });
    },
  );
  it.each([400, 404, 500, 599])("accepts error status %s", (statusCode) => {
    expect(
      new AppError("Safe message", statusCode, "TEST_ERROR").statusCode,
    ).toBe(statusCode);
  });

  it.each([200, 399, 600, 400.5, NaN, Infinity])(
    "rejects invalid error status %s",
    (statusCode) => {
      expect(
        () => new AppError("Safe message", statusCode, "TEST_ERROR"),
      ).toThrow(RangeError);
    },
  );

  it("logs an invalid AppError status and responds with a generic 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.get("/invalid-status", () => {
      throw new AppError(
        "Private implementation details",
        200,
        "INVALID_STATUS",
      );
    });
    app.use(errorHandler);

    const response = await request(app)
      .get("/invalid-status")
      .set("X-Lovat-Error-Format", "json-v1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      displayError: "Internal server error",
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "Unexpected failure",
      expect.objectContaining({ name: "RangeError" }),
    );
  });

  it("turns an awaited rejection into a logged generic 500 response", async () => {
    const failure = new Error("private database details");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.get("/failure", async () => {
      await Promise.reject(failure);
    });
    app.use(errorHandler);

    const response = await request(app)
      .get("/failure")
      .set("X-Lovat-Error-Format", "json-v1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      displayError: "Internal server error",
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "Unexpected failure",
      expect.objectContaining({ name: failure.name }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
  });

  it("returns the chosen status and safe message for an expected error", async () => {
    const app = express();
    app.get("/missing", () => {
      throw new AppError("Team not found", 404, "TEAM_NOT_FOUND");
    });
    app.use(errorHandler);

    const response = await request(app)
      .get("/missing")
      .set("X-Lovat-Error-Format", "json-v1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "TEAM_NOT_FOUND",
      message: "Team not found",
      displayError: "Team not found",
    });
  });

  it("logs server failures represented by AppError", async () => {
    const failure = new AppError(
      "Service unavailable",
      503,
      "SERVICE_UNAVAILABLE",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.get("/unavailable", () => {
      throw failure;
    });
    app.use(errorHandler);

    expect(
      (
        await request(app)
          .get("/unavailable")
          .set("X-Lovat-Error-Format", "json-v1")
      ).status,
    ).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "Unexpected failure",
      expect.objectContaining({ name: failure.name }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
  });

  it("logs and forwards a failure after headers are sent without sending again", () => {
    const failure = new Error("stream failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const next = vi.fn();
    const response = { headersSent: true, status: vi.fn(), json: vi.fn() };

    errorHandler(failure, {} as Request, response as unknown as Response, next);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      "Unexpected failure",
      expect.objectContaining({ name: failure.name }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      }),
    );
    expect(next.mock.calls[0][0]).not.toBe(failure);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

it("maps Prisma conflicts and missing records without exposing database details", async () => {
  const { ConflictError } = await import("../src/lib/errors.js");
  expect(new ConflictError("A safe conflict").message).toBe("A safe conflict");
  for (const code of ["P2002", "P2003", "P2034", "P2025", "UNKNOWN"]) {
    const failure = Object.assign(new Error("private SQL"), {
      name: "PrismaClientKnownRequestError",
      code,
    });
    const result = normalizeError(failure);
    expect(result.statusCode).toBe(
      code === "P2025" ? 404 : code === "UNKNOWN" ? 500 : 409,
    );
    expect(result.message).not.toContain("private SQL");
  }
});
it("keeps only valid public response details and stable error identifiers", async () => {
  const { responseError, errorMetadata, RequestValidationError } =
    await import("../src/lib/errors.js");
  expect(new RequestValidationError().statusCode).toBe(400);
  expect(responseError(418, null)).toMatchObject({
    code: "REQUEST_FAILED",
    message: "Request failed",
  });
  expect(responseError(500, { message: "private SQL" })).toMatchObject({
    message: "Internal server error",
  });
  expect(
    responseError(400, {
      error: "Correct the input",
      invalidFields: ["team"],
      retryAfterSeconds: 3,
    }),
  ).toMatchObject({
    message: "Correct the input",
    invalidFields: ["team"],
    retryAfterSeconds: 3,
  });
  expect(
    responseError(400, {
      message: 5,
      invalidFields: ["team", false],
      retryAfterSeconds: NaN,
    }),
  ).toEqual({
    code: "BAD_REQUEST",
    message: "Invalid request",
    displayError: "Invalid request",
  });
  expect(responseError(404, "NOT_FOUND").code).toBe("NOT_FOUND");
  expect(
    errorMetadata(Object.assign(new Error("private"), { code: "bad-code" }))
      .code,
  ).toBeUndefined();
});

it("normalizes thrown validation errors and retains only safe diagnostic codes", async () => {
  const { z } = await import("zod");
  const { errorMetadata } = await import("../src/lib/errors.js");
  const parsed = z.number().safeParse("invalid");
  expect(normalizeError(parsed.error)).toMatchObject({
    statusCode: 400,
    code: "INVALID_REQUEST",
    message: "Invalid request parameters",
  });
  const failure = Object.assign(new Error("private SQL"), {
    code: "P2002",
    stack: undefined,
  });
  expect(errorMetadata("private token")).toEqual({
    name: "NonErrorFailure",
    stack: undefined,
    code: undefined,
  });
  expect(errorMetadata(failure)).toEqual({
    name: "Error",
    code: "P2002",
    stack: undefined,
  });
});
