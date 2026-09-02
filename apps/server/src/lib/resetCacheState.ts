export type CacheResetDependencies = {
  resetRedis(): Promise<number>;
  deleteMetadata(): Promise<void>;
};

export const resetCacheState = async ({
  resetRedis,
  deleteMetadata,
}: CacheResetDependencies): Promise<number> => {
  let deletedRedisKeys = await resetRedis();
  await deleteMetadata();
  deletedRedisKeys += await resetRedis();

  return deletedRedisKeys;
};
