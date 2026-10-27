// Keep native jobs and their scratch storage bounded, and drain in-flight work
// before propagating an infrastructure failure or stopping the batch.
export async function runOcrPool<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
  stopped = () => false,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2)
    throw new Error("OCR batch concurrency must be 1 or 2");
  let cursor = 0,
    failed = false;
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, async () => {
      while (!failed && !stopped() && cursor < items.length) {
        const item = items[cursor++]!;
        try {
          await work(item);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  const error = results.find(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (error) throw error.reason;
}
