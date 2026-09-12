import { describe, expect, test, vi } from 'vitest';
import InFlightRequestTracker from '../../../src/utils/InFlightRequestTracker.js';

describe('InFlightRequestTracker#run', () => {
  test('Callers asking for the same key at the same time share the first execution and its result', async () => {
    const tracker = new InFlightRequestTracker<string>();
    const pendingTask = Promise.withResolvers<string>();
    const firstTask = vi.fn(() => pendingTask.promise);
    const ignoredTask = vi.fn(() => Promise.resolve('ignored'));

    const firstCall = tracker.run('key', firstTask);
    const secondCall = tracker.run('key', ignoredTask);
    pendingTask.resolve('result');

    await expect(Promise.all([firstCall, secondCall])).resolves.toEqual(['result', 'result']);
    expect(firstTask).toHaveBeenCalledOnce();
    expect(ignoredTask).not.toHaveBeenCalled();
  });

  test('Different keys run independently', async () => {
    const tracker = new InFlightRequestTracker<string>();
    const task = vi.fn((key: string) => Promise.resolve(`result for ${key}`));

    const results = await Promise.all([
      tracker.run('a', () => task('a')),
      tracker.run('b', () => task('b')),
    ]);

    expect(results).toEqual(['result for a', 'result for b']);
    expect(task).toHaveBeenCalledTimes(2);
  });

  test('A failure reaches every sharing caller without becoming sticky', async () => {
    const tracker = new InFlightRequestTracker<string>();
    const pendingTask = Promise.withResolvers<string>();
    const error = new Error('task failed');
    const task = vi.fn()
      .mockReturnValueOnce(pendingTask.promise)
      .mockReturnValueOnce(Promise.resolve('result'));

    const firstCall = tracker.run('key', task);
    const secondCall = tracker.run('key', task);
    pendingTask.reject(error);

    await expect(firstCall).rejects.toBe(error);
    await expect(secondCall).rejects.toBe(error);
    await expect(tracker.run('key', task)).resolves.toBe('result');
    expect(task).toHaveBeenCalledTimes(2);
  });

  test('A settled key is released before its own callers continue, so it is not a cache', async () => {
    const tracker = new InFlightRequestTracker<number>();
    const task = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const secondResult = tracker.run('key', task).then(() => tracker.run('key', task));

    await expect(secondResult).resolves.toBe(2);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
