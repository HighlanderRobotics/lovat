/** Cross-environment numeric report bridge. Deploy separately in production with
 * a view-only DB role. The PR worker never receives production DB credentials. */
import { createHash, timingSafeEqual } from "node:crypto";
export function reportSourceHandler(options: {
  token: string;
  read: (
    event: string,
    after: string,
  ) => Promise<{ reportUuid: string; payload: unknown }[]>;
}) {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ status: "ok" });
    const auth = request.headers.get("Authorization") ?? "";
    if (
      options.token.length < 32 ||
      !auth.startsWith("Bearer ") ||
      !timingSafeEqual(digest(auth.slice(7)), digest(options.token))
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const event = url.pathname.match(
      /^\/reports\/(2026(?:cacg|casnf|cagle))$/,
    )?.[1];
    const after = url.searchParams.get("after") ?? "";
    if (
      request.method !== "GET" ||
      !event ||
      (after && !/^[a-f0-9-]{36}$/.test(after)) ||
      [...url.searchParams.keys()].some((k) => k !== "after")
    )
      return Response.json({ error: "Unsupported request" }, { status: 400 });
    try {
      const rows = await options.read(event, after);
      return Response.json(
        {
          eventKey: event,
          reports: rows.map((r) => r.payload),
          nextCursor: rows.length === 250 ? rows.at(-1)!.reportUuid : null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return Response.json(
        { error: "Report source unavailable" },
        { status: 503 },
      );
    }
  };
}
if (import.meta.main) {
  const token = process.env.OCR_REPORT_SOURCE_TOKEN ?? "";
  if (token.length < 32) throw Error("Strong source token required");
  // Only the view-only role's credentials are provisioned in this service.
  if (
    !process.env.OCR_REPORT_SOURCE_USER ||
    !process.env.OCR_REPORT_SOURCE_PASSWORD ||
    !process.env.PGHOST ||
    !process.env.PGDATABASE
  )
    throw Error("View-only database role required");
  const sql = new Bun.SQL({
    hostname: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    username: process.env.OCR_REPORT_SOURCE_USER,
    password: process.env.OCR_REPORT_SOURCE_PASSWORD,
    max: 2,
  });
  Bun.serve({
    hostname: "0.0.0.0",
    port: Number(process.env.PORT ?? 8080),
    fetch: reportSourceHandler({
      token,
      read: async (event, after) =>
        sql`SELECT "reportUuid",payload FROM "OcrReportSourceV1" WHERE "eventKey"=${event} AND "reportUuid">${after} ORDER BY "reportUuid" LIMIT 250`,
    }),
  });
}
