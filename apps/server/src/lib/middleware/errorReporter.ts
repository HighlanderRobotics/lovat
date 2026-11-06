import type { Request, Response, NextFunction } from "express";
import { posthog } from "../../posthogClient.js";
import { errorMetadata, normalizeError, reportError } from "../errors.js";

/** Report only server failures, with no raw messages, headers, query or body. */
export function errorReporter(
  error: unknown,
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const normalized = normalizeError(error);
  if (normalized.statusCode >= 500) {
    const safe = new Error(normalized.message);
    safe.name = errorMetadata(error).name;
    const frames = errorMetadata(error).stack;
    if (frames) {
      safe.stack = `${safe.name}: ${safe.message}\n${frames}`;
    }
    try {
      posthog.captureException(safe, undefined, {
        method: req.method,
        code: normalized.code,
      });
    } catch (reportingError) {
      reportError(reportingError, "Error reporting failed");
    }
  }
  next(error);
}
