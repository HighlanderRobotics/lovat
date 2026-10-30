import { db } from "@lovat/db";
import { ensureBuiltInTrainingExercise } from "../src/handler/training/builtInExercise.js";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error(
    "This fixture seed only runs against the disposable local lovat_test database.",
  );
}
try {
  await ensureBuiltInTrainingExercise();
  console.log("Local training exercise ready: 2026joh_qm19, robot 118.");
} finally {
  await db.$disconnect();
}
