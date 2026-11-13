import prisma from "../prismaClient.js";
import { pingRedis } from "../redisClient.js";
import { createHealth } from "./health.js";

// Both are critical today: request handlers have no general Redis fallback.
export const runtimeHealth = createHealth([
  () => prisma.$queryRaw`SELECT 1`,
  () => pingRedis(),
]);
