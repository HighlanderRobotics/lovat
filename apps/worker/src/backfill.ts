import { db } from "./db";
import { enqueueImport } from "./scheduler";
import { validateSeason } from "./jobs/shared";

const [first = "1992", last = String(new Date().getUTCFullYear())] =
  process.argv.slice(2);

try {
  const firstYear = Number(first);
  const lastYear = Number(last);

  validateSeason(firstYear);
  validateSeason(lastYear);

  if (firstYear > lastYear)
    throw new Error("Provide an ascending season range");

  for (let year = lastYear; year >= firstYear; year--) {
    for (const kind of ["tournaments", "districts", "team-seasons"] as const) {
      await enqueueImport(db, kind, String(year));
    }

    console.log(`Season ${year}: imports queued`);
  }
} finally {
  await db.$disconnect();
}
