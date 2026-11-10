export type APIError = { code?: string; message?: string };

export function isMissingMatchResponse(status: number, body: unknown): boolean {
  return status === 404 && parseAPIError(body).code === "MATCH_NOT_FOUND";
}

export function isUnavailableScheduleError(body: unknown): boolean {
  const error = parseAPIError(body);
  return (
    error.code === "MATCHES_NOT_AVAILABLE" ||
    error.message === "Matches are not available for this tournament" ||
    error.message === "Matches are not available for this tournamnet"
  );
}

/** Accept the shared JSON response and responses from older Server releases. */
export function parseAPIError(body: unknown): APIError {
  if (typeof body === "string") {
    try {
      return parseAPIError(JSON.parse(body));
    } catch {
      return { code: body, message: body };
    }
  }
  if (!body || typeof body !== "object") return {};
  const fields = body as Record<string, unknown>;
  const message = fields.displayError ?? fields.message ?? fields.error;
  return {
    code: typeof fields.code === "string" ? fields.code : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}
