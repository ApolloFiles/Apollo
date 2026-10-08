import type { DeepMockProxy } from 'vitest-mock-extended';
import { AniDbFloodControlError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbFloodControlError.js';
import type { AniDbBan, AniDbBanState } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import { AniDbFloodControl } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbFloodControl.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ACTIVE_BAN: AniDbBan = {
  bannedAt: new Date('2024-01-01T00:00:00.000Z'),
  bannedUntil: new Date('2099-01-01T00:00:00.000Z'),
  reason: 'banned for flooding',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe(AniDbFloodControl, () => {
  let banState: DeepMockProxy<AniDbBanState>;
  let subject: AniDbFloodControl;

  beforeEach(() => {
    vi.useFakeTimers();

    banState = createStrictDeepMock<AniDbBanState>();
    banState.getActiveBan.mockResolvedValue(null);

    subject = new AniDbFloodControl(banState);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('Never runs more than one task at a time', async () => {
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await sleep(120);
      running -= 1;
    };

    const allTasks = Promise.all([subject.run(task), subject.run(task), subject.run(task)]);
    await vi.advanceTimersByTimeAsync(30_000);
    await allTasks;

    expect(maxRunning).toBe(1);
  });

  test('Measures the delay from the end of the previous request, not its start', async () => {
    const startedAt: number[] = [];
    const task = async () => {
      startedAt.push(performance.now());
      await sleep(120);
    };

    const allTasks = Promise.all([subject.run(task), subject.run(task)]);
    await vi.advanceTimersByTimeAsync(30_000);
    await allTasks;

    expect(startedAt[1] - startedAt[0]).toBe(2120);
  });

  test('Rejects a caller once the estimated queue wait reaches the maximum', async () => {
    const task = vi.fn(async () => 'done');
    const accepted = Array.from({ length: 16 }, () => subject.run(task));

    await expect(subject.run(task)).rejects.toThrow(new AniDbFloodControlError('Refusing to contact the AniDB API because the queue is backed up by about 30s'));

    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(accepted);
    expect(task).toHaveBeenCalledTimes(16);
  });

  test('Keeps accepting new callers after one was rejected for a backed-up queue', async () => {
    const task = vi.fn(async () => 'done');
    const accepted = Array.from({ length: 16 }, () => subject.run(task));
    await expect(subject.run(task)).rejects.toThrow(AniDbFloodControlError);
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(accepted);

    const afterDrain = subject.run(task);
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(afterDrain).resolves.toBe('done');
  });

  test('Refuses to run the task at all while the client is banned', async () => {
    banState.getActiveBan.mockResolvedValue(ACTIVE_BAN);
    const task = vi.fn(async () => 'done');

    await expect(subject.run(task)).rejects.toThrow(new AniDbFloodControlError('Refusing to contact the AniDB API until 2099-01-01T00:00:00.000Z: banned for flooding'));

    expect(task).not.toHaveBeenCalled();
  });

  test('Stops an already queued caller when a ban is recorded while it waits', async () => {
    const queuedTask = vi.fn(async () => 'second');
    const first = subject.run(async () => 'first');
    const queued = subject.run(queuedTask);
    const queuedRejection = expect(queued).rejects.toThrow(new AniDbFloodControlError('Refusing to contact the AniDB API until 2099-01-01T00:00:00.000Z: banned for flooding'));
    await vi.advanceTimersByTimeAsync(0);

    banState.getActiveBan.mockResolvedValue(ACTIVE_BAN);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(first).resolves.toBe('first');
    await queuedRejection;
    expect(queuedTask).not.toHaveBeenCalled();
  });

  test('Propagates a failing task and frees the slot for the next one', async () => {
    const taskError = new Error('request exploded');
    await expect(subject.run(async () => {
      throw taskError;
    })).rejects.toBe(taskError);

    const next = subject.run(async () => 'done');
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(next).resolves.toBe('done');
  });

  describe('when the app shuts down', () => {
    test('Does nothing when nothing is queued', () => {
      subject.dispose();

      expect(vi.getTimerCount()).toBe(0);
    });

    test('Rejects everything still queued and clears the pending timer', async () => {
      const queuedTask = vi.fn(async () => 'second');
      const first = subject.run(async () => 'first');
      const queued = subject.run(queuedTask);
      const queuedRejection = expect(queued).rejects.toThrow(new AniDbFloodControlError('Cancelled the queued AniDB API request because the app is shutting down'));
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);

      subject.dispose();

      expect(vi.getTimerCount()).toBe(0);
      await expect(first).resolves.toBe('first');
      await queuedRejection;
      expect(queuedTask).not.toHaveBeenCalled();
    });
  });
});
