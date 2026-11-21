import { ensureBuiltInTrainingExercise } from "./handler/training/builtInExercise.js";
import { app } from "./app.js";
import scheduleJobs from "./lib/scheduleJobs.js";
import { connectRedis } from "./redisClient.js";

import { attachTrainingSockets } from "./handler/training/trainingSockets.js";

const port = process.env.PORT || 3000;

await ensureBuiltInTrainingExercise();
await scheduleJobs();
await connectRedis();

const server = app.listen(port, () => {
  console.log(`Server running on :${port}`);
});

attachTrainingSockets(server);
