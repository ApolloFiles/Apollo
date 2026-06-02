/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight at once.
 * Results are returned in the same order as `items`.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (concurrency < 1) {
    throw new Error(`concurrency must be >= 1, got ${concurrency}`);
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) {
          return;
        }
        results[i] = await fn(items[i], i);
      }
    })());
  }

  await Promise.all(workers);
  return results;
}
