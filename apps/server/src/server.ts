import { app } from "./app.js";
import { startServer } from "./lib/startServer.js";
import scheduleJobs from "./lib/scheduleJobs.js";
import { connectRedis } from "./redisClient.js";

const port = process.env.PORT || 3000;

await startServer({
  initializeCache: connectRedis,
  scheduleJobs,
  listen: () => {
    app.listen(port, () => {
      console.log(`Server running on :${port}`);
    });
  },
});
