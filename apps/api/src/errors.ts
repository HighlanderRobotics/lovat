export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof Error && "code" in error) {
    const code = String(error.code);
    if (code === "P2025")
      return new HttpError(404, "NOT_FOUND", "Resource not found");
    if (["P2002", "P2003", "P2034"].includes(code))
      return new HttpError(
        409,
        "CONFLICT",
        "Request conflicts with current data",
      );
    if (["P2024", "P1001", "P1002"].includes(code))
      return new HttpError(
        503,
        "DATABASE_UNAVAILABLE",
        "Database temporarily unavailable",
      );
  }
  return new HttpError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
}
