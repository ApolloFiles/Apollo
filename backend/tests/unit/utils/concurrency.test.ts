import { runWithConcurrency } from '#src/utils/concurrency.js';

describe(runWithConcurrency, () => {
  test('Returns the results in the order of the items, not of completion', async () => {
    const delaysInMs = [30, 0, 10];

    const results = await runWithConcurrency(delaysInMs, 3, async (delayInMs) => {
      await new Promise((resolve) => setTimeout(resolve, delayInMs));
      return `waited ${delayInMs}ms`;
    });

    expect(results).toEqual(['waited 30ms', 'waited 0ms', 'waited 10ms']);
  });

  test('Never has more calls in flight than the concurrency allows', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await runWithConcurrency(['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv', 'S01E04.mkv', 'S01E05.mkv'], 2, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    });

    expect(maxInFlight).toBe(2);
  });

  describe('when a call rejects', () => {
    let started: string[];
    let finished: string[];

    async function processEpisode(file: string): Promise<void> {
      started.push(file);
      if (file === 'S01E02.mkv') {
        throw new Error(`Could not probe '${file}'`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished.push(file);
    }

    beforeEach(() => {
      started = [];
      finished = [];
    });

    test('Rejects with the error of that call', async () => {
      await expect(runWithConcurrency(['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv'], 2, processEpisode))
        .rejects.toThrow(new Error('Could not probe \'S01E02.mkv\''));
    });

    test('Rejects only after the calls already in flight have finished', async () => {
      await expect(runWithConcurrency(['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv'], 2, processEpisode)).rejects.toThrow();

      expect(finished).toEqual(['S01E01.mkv']);
    });

    test('Starts no further items', async () => {
      await expect(runWithConcurrency(['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv', 'S01E04.mkv'], 2, processEpisode)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(started).toEqual(['S01E01.mkv', 'S01E02.mkv']);
    });
  });

  test('Rejects a concurrency below one', async () => {
    await expect(runWithConcurrency(['S01E01.mkv'], 0, async () => undefined))
      .rejects.toThrow(new Error('concurrency must be >= 1, got 0'));
  });
});
