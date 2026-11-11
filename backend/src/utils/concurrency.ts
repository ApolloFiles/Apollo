/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight at once.
 * Results are returned in the same order as `items`.
 * After the first rejection no further items are started; it rejects once the calls already in flight have settled.
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
  let failed = false;

  const workerCount = Math.min(concurrency, items.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (!failed) {
        const i = nextIndex++;
        if (i >= items.length) {
          return;
        }

        try {
          results[i] = await fn(items[i], i);
        } catch (err) {
          failed = true;
          throw err;
        }
      }
    })());
  }

  const settled = await Promise.allSettled(workers);
  const rejection = settled.find((result) => result.status === 'rejected');
  if (rejection != null) {
    throw rejection.reason;
  }
  return results;
}
