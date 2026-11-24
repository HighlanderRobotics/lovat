/** Imports and maintenance belong to the durable Worker queue. */
export default async function scheduleJobs(): Promise<void> {
  // Retain the startup hook for consumers; never start API-owned DB timers.
}
