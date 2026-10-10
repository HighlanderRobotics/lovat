import { db } from "./db";
import { enqueueImport, jobKinds, type JobKind } from "./scheduler";

const [kind, target] = process.argv.slice(2);

try {
  if (!kind || !target || !jobKinds.includes(kind as JobKind)) {
    throw new Error(`Usage: bun run enqueue <${jobKinds.join("|")}> <target>`);
  }

  const job = await enqueueImport(db, kind as JobKind, target);

  console.log(
    `${job.kind} ${job.targetKey}: scheduled for ${job.runAt.toISOString()}`,
  );
} finally {
  await db.$disconnect();
}
