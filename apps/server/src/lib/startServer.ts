export type ServerStartupDependencies = {
  initializeCache(): Promise<void>;
  scheduleJobs(): Promise<void>;
  listen(): void;
};

export const startServer = async ({
  initializeCache,
  scheduleJobs,
  listen,
}: ServerStartupDependencies): Promise<void> => {
  await initializeCache();
  await scheduleJobs();
  listen();
};
