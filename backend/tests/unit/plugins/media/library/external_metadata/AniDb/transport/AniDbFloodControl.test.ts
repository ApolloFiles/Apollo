import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { AniDbFloodControlError } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbFloodControlError.js';
import type { AniDbBan } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import type { AniDbBanState } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import { AniDbFloodControl } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbFloodControl.js';
import { createStrictDeepMock } from '../../../../../../../test-helpers.js';

const MIN_DELAY_MS = 2000;
const ACTIVE_BAN: AniDbBan = {
  bannedAt: new Date('2024-01-01T00:00:00.000Z'),
  bannedUntil: new Date('2099-01-01T00:00:00.000Z'),
  reason: 'banned for flooding',
};

function createFloodControl(): {
  subject: AniDbFloodControl,
  mocks: { banState: DeepMockProxy<AniDbBanState> },
} {
  const banState = createStrictDeepMock<AniDbBanState>();
  banState.getActiveBan.mockResolvedValue(null);

  return { subject: new AniDbFloodControl(banState), mocks: { banState } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AniDbFloodControl#run', () => {
  test('Never runs more than one task at a time', async () => {
    const { subject } = createFloodControl();

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
    const { subject } = createFloodControl();

    const startedAt: number[] = [];
    const task = async () => {
      startedAt.push(performance.now());
      await sleep(120);
    };

    const allTasks = Promise.all([subject.run(task), subject.run(task)]);
    await vi.advanceTimersByTimeAsync(30_000);
    await allTasks;

    expect(startedAt[1] - startedAt[0]).toBe(120 + MIN_DELAY_MS);
  });

  test('Rejects a caller once the estimated queue wait reaches the maximum', async () => {
    const { subject } = createFloodControl();
    const task = vi.fn(async () => 'done');

    const accepted = Array.from({ length: 16 }, () => subject.run(task));
    const rejected = subject.run(task);

    await expect(rejected).rejects.toThrow(AniDbFloodControlError);

    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(accepted);

    expect(task).toHaveBeenCalledTimes(16);
  });

  test('Keeps accepting new callers after one was rejected for a backed-up queue', async () => {
    const { subject } = createFloodControl();
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
    const { subject, mocks } = createFloodControl();
    mocks.banState.getActiveBan.mockResolvedValue(ACTIVE_BAN);
    const task = vi.fn(async () => 'done');

    await expect(subject.run(task)).rejects.toThrow(AniDbFloodControlError);
    expect(task).not.toHaveBeenCalled();
  });

  test('Stops an already queued caller when a ban is recorded while it waits', async () => {
    const { subject, mocks } = createFloodControl();
    const queuedTask = vi.fn(async () => 'second');

    const first = subject.run(async () => 'first');
    const queued = subject.run(queuedTask);
    const queuedRejection = expect(queued).rejects.toThrow(AniDbFloodControlError);

    await vi.advanceTimersByTimeAsync(0);
    mocks.banState.getActiveBan.mockResolvedValue(ACTIVE_BAN);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(first).resolves.toBe('first');
    await queuedRejection;
    expect(queuedTask).not.toHaveBeenCalled();
  });

  test('Propagates a failing task and frees the slot for the next one', async () => {
    const { subject } = createFloodControl();

    await expect(subject.run(async () => {
      throw new Error('request exploded');
    })).rejects.toThrow('request exploded');

    const next = subject.run(async () => 'done');
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(next).resolves.toBe('done');
  });
});

describe('AniDbFloodControl#dispose', () => {
  test('Does nothing when nothing is queued', () => {
    const { subject } = createFloodControl();

    expect(() => subject.dispose()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('Rejects everything still queued and clears the pending timer', async () => {
    const { subject } = createFloodControl();
    const queuedTask = vi.fn(async () => 'second');

    const first = subject.run(async () => 'first');
    const queued = subject.run(queuedTask);
    const queuedRejection = expect(queued).rejects.toThrow('shutting down');

    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    subject.dispose();

    expect(vi.getTimerCount()).toBe(0);
    await expect(first).resolves.toBe('first');
    await queuedRejection;
    expect(queuedTask).not.toHaveBeenCalled();
  });
});
