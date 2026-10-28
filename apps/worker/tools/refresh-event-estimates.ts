// Operator backfill of derived rows only; no video downloads or report changes.
import { refreshMatchEstimates } from "../src/ocr/estimate-store";
const [eventKey, rawSources] = Bun.argv.slice(2);
const sources = rawSources?.split(",").map(Number) ?? [];
if (
  !eventKey ||
  !/^2026[a-z0-9]+$/.test(eventKey) ||
  !sources.length ||
  sources.length > 100 ||
  sources.some((n) => !Number.isSafeInteger(n) || n < 1)
)
  throw new Error(
    "Use refresh-event-estimates.ts EVENT_KEY SOURCE_TEAMS_COMMA_SEPARATED",
  );
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
const local =
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
  url.pathname === "/lovat_test";
if (
  !local &&
  (!process.env.LOVAT_ESTIMATE_ENVIRONMENT_ID ||
    process.env.LOVAT_ESTIMATE_ENVIRONMENT_ID !==
      process.env.RAILWAY_ENVIRONMENT_ID)
)
  throw new Error("Explicit matching target Railway environment required");
const { db } = await import("../src/db");
try {
  const matches = await db.match.findMany({
    where: {
      tournamentKey: eventKey,
      scoreboardOcr: { status: { in: ["VALIDATED", "PARTIAL"] } },
    },
    orderBy: { key: "asc" },
    select: { key: true },
    take: 1000,
  });
  let rows = 0;
  for (const match of matches) {
    const count = await refreshMatchEstimates(db, match.key, sources);
    rows += count;
    console.info(JSON.stringify({ matchKey: match.key, estimatedRows: count }));
  }
  console.info(
    JSON.stringify({ eventKey, matches: matches.length, estimatedRows: rows }),
  );
} finally {
  await db.$disconnect();
}
