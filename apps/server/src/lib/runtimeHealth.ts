import { pingRedis } from "../redisClient.js";
import { createHealth } from "./health.js";

// Redis has no general request fallback. Do not probe Postgres here: a polling
// monitor would keep sleeping databases awake. Verify SQL explicitly at release.
export const runtimeHealth = createHealth([() => pingRedis()]);
