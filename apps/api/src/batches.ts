/** A large item gets its own batch; callers enforce each item's absolute limit. */
export function* boundedBatches<T>(
  rows: readonly T[],
  weight: (row: T) => number,
  maxItems = 250,
  maxWeight = 4096,
): Generator<T[]> {
  let batch: T[] = [],
    size = 0;
  for (const row of rows) {
    const next = weight(row);
    if (batch.length && (batch.length >= maxItems || size + next > maxWeight)) {
      yield batch;
      batch = [];
      size = 0;
    }
    batch.push(row);
    size += next;
  }
  if (batch.length) yield batch;
}
