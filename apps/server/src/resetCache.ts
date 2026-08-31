import { loadEnvironmentFile } from "./lib/loadEnvironmentFile.js";

loadEnvironmentFile();

const [
  { resetCache },
  { default: prismaClient },
  { closeRedis, connectRedis },
] = await Promise.all([
  import("./lib/clearCache.js"),
  import("./prismaClient.js"),
  import("./redisClient.js"),
]);

try {
  await connectRedis();
  await resetCache();
} finally {
  try {
    await prismaClient.$disconnect();
  } finally {
    await closeRedis();
  }
}
