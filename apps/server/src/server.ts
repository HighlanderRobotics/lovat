import { ensureBuiltInTrainingExercise } from "./handler/training/builtInExercise.js";
import { app } from "./app.js";
import scheduleJobs from "./lib/scheduleJobs.js";
import { connectRedis, closeRedis } from "./redisClient.js";

import { attachTrainingSockets } from "./handler/training/trainingSockets.js";

import prisma from "./prismaClient.js";
import { posthog } from "./posthogClient.js";
import { runtimeHealth } from "./lib/runtimeHealth.js";
import { createShutdown } from "./lib/shutdown.js";

const port = process.env.PORT || 3000;

await ensureBuiltInTrainingExercise();
const stopJobs = await scheduleJobs();
await connectRedis();

const server = app.listen(port, () => {
  runtimeHealth.start();
  console.log(`Server running on :${port}`);
});

const sockets = attachTrainingSockets(server);
const shutdown = createShutdown({
  server,
  health: runtimeHealth,
  stopWork: stopJobs,
  sockets,
  cleanup: [
    () => prisma.$disconnect(),
    () => closeRedis(),
    () => posthog.shutdown(),
  ],
  exit: (code) => process.exit(code),
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
