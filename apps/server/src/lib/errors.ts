import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

const defaults: Record<number, [string, string]> = {
  400: ["BAD_REQUEST", "Invalid request"],
  401: ["UNAUTHORIZED", "Unauthorized"],
  403: ["FORBIDDEN", "Forbidden"],
  404: ["NOT_FOUND", "Not found"],
  409: ["CONFLICT", "Request conflicts with existing data"],
  413: ["REQUEST_TOO_LARGE", "Request body is too large"],
  415: ["UNSUPPORTED_MEDIA_TYPE", "Unsupported request encoding"],
  429: ["RATE_LIMITED", "Too many requests. Please try again later."],
};
export interface ErrorDetails {
  invalidFields?: string[];
  retryAfterSeconds?: number;
}
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
      throw new RangeError(
        "AppError statusCode must be an integer from 400 to 599",
      );
    }
    this.name = "AppError";
  }
}
export class RequestValidationError extends AppError {
  constructor(
    message = "Invalid request parameters",
    details: ErrorDetails = {},
  ) {
    super(message, 400, "INVALID_REQUEST", details);
  }
}
export class ConflictError extends AppError {
  constructor(message = "Request conflicts with existing data") {
    super(message, 409, "CONFLICT");
  }
}
/** Recognize library errors explicitly; never trust an arbitrary error.status. */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof ZodError) {
    return new RequestValidationError();
  }
  if (error instanceof Error && "type" in error) {
    const types: Record<string, [number, string, string]> = {
      "entity.parse.failed": [400, "INVALID_JSON", "Invalid JSON body"],
      "entity.too.large": [
        413,
        "REQUEST_TOO_LARGE",
        "Request body is too large",
      ],
      "encoding.unsupported": [
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Unsupported request encoding",
      ],
      "charset.unsupported": [
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Unsupported request charset",
      ],
      "request.aborted": [400, "REQUEST_ABORTED", "Request was interrupted"],
      "request.size.invalid": [
        400,
        "INVALID_REQUEST_SIZE",
        "Invalid request size",
      ],
    };
    const match =
      typeof error.type === "string" && Object.hasOwn(types, error.type)
        ? types[error.type]
        : undefined;
    if (match) {
      return new AppError(match[2], match[0], match[1]);
    }
  }
  if (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    "code" in error
  ) {
    if (["P2002", "P2003", "P2034"].includes(String(error.code))) {
      return new ConflictError();
    }
    if (error.code === "P2025") {
      return new AppError("Record not found", 404, "NOT_FOUND");
    }
  }
  return new AppError("Internal server error", 500, "INTERNAL_SERVER_ERROR");
}
/** Omit messages, causes, SQL, request data and provider configs from diagnostics. */
export function errorMetadata(error: unknown): {
  name: string;
  stack?: string;
  code?: string;
} {
  const name = error instanceof Error ? error.name : "NonErrorFailure";
  const stack =
    error instanceof Error
      ? error.stack
          ?.split("\n")
          .filter((line) => line.trim().startsWith("at "))
          .join("\n")
      : undefined;
  const code =
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : undefined;
  return { name, stack, code };
}
export function reportError(
  error: unknown,
  context = "Unexpected failure",
): void {
  console.error(context, errorMetadata(error));
}

/** Timers cannot forward failures to Express; report each failed run locally. */
export async function runBackgroundTask(
  task: () => Promise<unknown>,
  context: string,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    reportError(error, context);
  }
}
export function errorBody(error: AppError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    displayError: error.message,
    ...error.details,
  };
}
/** Direct guard responses use the same contract as errors thrown to Express. */
export function responseError(
  statusCode: number,
  body: unknown,
): Record<string, unknown> {
  const fallback =
    defaults[statusCode] ??
    (statusCode >= 500
      ? ["INTERNAL_SERVER_ERROR", "Internal server error"]
      : ["REQUEST_FAILED", "Request failed"]);
  const fields =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const candidate =
    typeof body === "string"
      ? body
      : (fields.displayError ?? fields.message ?? fields.error);
  const trusted =
    typeof fields.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(fields.code);
  const message =
    (statusCode < 500 || trusted) && typeof candidate === "string"
      ? candidate
      : fallback[1];
  const code = trusted
    ? String(fields.code)
    : typeof body === "string" && /^[A-Z][A-Z0-9_]*$/.test(body)
      ? body
      : fallback[0];
  const details: ErrorDetails = {};
  if (
    Array.isArray(fields.invalidFields) &&
    fields.invalidFields.every((field) => typeof field === "string")
  ) {
    details.invalidFields = fields.invalidFields;
  }
  if (
    typeof fields.retryAfterSeconds === "number" &&
    Number.isFinite(fields.retryAfterSeconds)
  ) {
    details.retryAfterSeconds = fields.retryAfterSeconds;
  }
  return errorBody(new AppError(message, statusCode, code, details));
}
export function errorResponses(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const send = res.send.bind(res);
  const json = res.json.bind(res);
  const sendError = (body: unknown) => {
    res.removeHeader("Content-Length");
    res.type("application/json");
    return send(JSON.stringify(responseError(res.statusCode, body)));
  };
  res.send = (body?: unknown) =>
    res.statusCode >= 400 ? sendError(body) : send(body);
  res.json = (body?: unknown) =>
    res.statusCode >= 400 ? sendError(body) : json(body);
  next();
}
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const normalized = normalizeError(error);
  if (normalized.statusCode >= 500) {
    reportError(error);
  }
  if (res.headersSent) {
    next(normalized);
    return;
  }
  res.status(normalized.statusCode).json(errorBody(normalized));
}
