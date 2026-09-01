import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type Accel, SOFTWARE } from '../../../../../src/plugins/official/ffmpeg/accel/Accel.js';
import { createFfmpegDevice } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import type FfmpegCapabilityCache from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilityCache.js';
import HwContext from '../../../../../src/plugins/official/ffmpeg/accel/HwContext.js';
import type FfmpegCandidatePlanner from '../../../../../src/plugins/official/ffmpeg/job/FfmpegCandidatePlanner.js';
import type { FfmpegJob } from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJob.js';
import FfmpegJobRunner from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import FfmpegJobStats, { type FfmpegAttemptRecord } from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJobStats.js';
import UnretryableFfmpegJobError from '../../../../../src/plugins/official/ffmpeg/job/UnretryableFfmpegJobError.js';
import type FfmpegHandle from '../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import FakeProcessRunner from '../process/FakeProcessRunner.js';

const CUDA_DEVICE = createFfmpegDevice('cuda', '0', 'nvidia');
const CUDA = new HwContext(CUDA_DEVICE, 'fullChain', 8);

function createRunner(processRunner: FakeProcessRunner, candidates: Accel[]): { runner: FfmpegJobRunner, forgetDevice: ReturnType<typeof vi.fn>, records: FfmpegAttemptRecord[] } {
  const planner = { plan: async () => candidates } as unknown as FfmpegCandidatePlanner;
  const forgetDevice = vi.fn();
  const capabilityCache = { forgetDevice } as unknown as FfmpegCapabilityCache;
  const records: FfmpegAttemptRecord[] = [];
  const stats = new FfmpegJobStats();
  vi.spyOn(stats, 'record').mockImplementation((record) => void records.push(record));
  return { runner: new FfmpegJobRunner(processRunner.asFfmpegProcessRunner(), planner, capabilityCache, stats), forgetDevice, records };
}

/** Fails the attempt on a non-zero exit code, like the frame extracting jobs do. */
function createJob(overrides: Partial<FfmpegJob<string>> = {}): FfmpegJob<string> {
  return {
    name: 'test-job',
    acceleration: { input: { path: 'input.mkv', codecName: 'h264', pixelFormat: 'yuv420p', width: 1920, height: 1080 }, gpuFilters: true, videoEncoder: null },

    buildArgs: (accel) => ['-i', 'input.mkv', '--accel', accel.id],

    awaitOutcome: async (handle, accel) => {
      const exitResult = await handle.waitForExit();
      if (exitResult.exitCode !== 0) {
        throw new Error(`exited with ${exitResult.exitCode}`);
      }
      return accel.id;
    },

    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('FfmpegJobRunner#run', () => {
  test('Stops at the first candidate that works', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe(CUDA.id);
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Builds the arguments for the candidate it is attempting', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob());

    expect(processRunner.spawnCalls[0].args).toContain(CUDA.id);
    expect(processRunner.spawnCalls[1].args).toContain('software');
  });

  test('Falls back to the next candidate when an attempt fails', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 218 }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe('software');
  });

  test('Passes the spawn options of the job through', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ spawnOptions: { cwd: '/tmp/work', logVerbosity: 'debug' } }));

    expect(processRunner.spawnCalls[0].options).toEqual({ cwd: '/tmp/work', logVerbosity: 'debug' });
  });

  test('Throws the failure of the last candidate once every one of them failed', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 2 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).rejects.toThrow('exited with 2');
    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Gives up right away on a failure that taking hardware away cannot fix', async () => {
    const processRunner = new FakeProcessRunner([
      {
        exitCode: 254,
        logLines: [
          '[in#0 @ 0x55868d1b00c0] [error] Error opening input: No such file or directory',
          '[error] Error opening input file /does/not/exist.mkv.',
          '[fatal] Error opening input files: No such file or directory',
        ],
      },
      { exitCode: 0 },
    ]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).rejects.toThrow('exited with 254');
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Keeps retrying when a missing file is only mentioned by a warning', async () => {
    const processRunner = new FakeProcessRunner([
      {
        exitCode: 255,
        logLines: [
          '[warning] Failed to open /usr/share/fonts/whatever.ttf: No such file or directory',
          '[error] No device available for decoder: device type cuda needed for codec h264.',
        ],
      },
      { exitCode: 0 },
    ]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe('software');
    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Has a device probed again when it could not be created although its probes passed', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 255, logLines: ['[AVHWDeviceContext @ 0x1] [error] Cannot load libcuda.so.1', '[error] Device creation failed: -1.'] },
      { exitCode: 0 },
    ]);
    const { runner, forgetDevice } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob());

    expect(forgetDevice).toHaveBeenCalledWith(CUDA_DEVICE);
  });

  test('Keeps what it knows about a device when only the decoder cannot handle the file', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 69, logLines: ['[av1 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.'] },
      { exitCode: 0 },
    ]);
    const { runner, forgetDevice } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob());

    expect(forgetDevice).not.toHaveBeenCalled();
  });

  test('Gives up right away when ffmpeg refuses to overwrite its output', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 1, logLines: [`[fatal] File 'out.mp4' already exists. Exiting.`] },
      { exitCode: 0 },
    ]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).rejects.toThrow();
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Fails an attempt the moment its process dies, even while the job is still waiting for something else', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    const result = await runner.run(createJob({
      awaitOutcome: async (handle, accel) => {
        if (accel !== SOFTWARE) {
          await new Promise(() => undefined);
        }
        await handle.waitForExit();
        return accel.id;
      },
    }));

    expect(result).toBe('software');
  });

  test('Kills a process the job gave up on', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob({
      awaitOutcome: async (handle, accel) => {
        if (accel !== SOFTWARE) {
          throw new Error('gave up while ffmpeg was still running');
        }
        await handle.waitForExit();
        return accel.id;
      },
    }));

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual(['SIGKILL']);
  });

  test('Leaves a process the job is still using alone', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const { runner } = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ awaitOutcome: async (_handle, accel) => accel.id }));

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual([]);
  });
});

describe('FfmpegJobRunner#run when the job cannot build its arguments', () => {
  test('Fails without trying another candidate, but leaves a record', async () => {
    const processRunner = new FakeProcessRunner([]);
    const { runner, records } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob({
      buildArgs: () => {
        throw new Error('no video stream');
      },
    }))).rejects.toThrow('no video stream');

    expect(processRunner.spawnCalls).toHaveLength(0);
    expect(records.map((record) => [record.accel, record.verdict, record.failureKind])).toEqual([[CUDA.id, 'failed', 'aborted']]);
  });

  test('Records whatever was thrown, even when it is not an Error', async () => {
    const processRunner = new FakeProcessRunner([]);
    const { runner, records } = createRunner(processRunner, [CUDA]);

    await expect(runner.run(createJob({
      buildArgs: () => {
        throw 'not even an Error';
      },
    }))).rejects.toBe('not even an Error');

    expect(records[0].logProblems).toBe('not even an Error');
  });
});

describe('FfmpegJobRunner#run without candidates', () => {
  test('Fails instead of quietly doing nothing', async () => {
    const processRunner = new FakeProcessRunner([]);
    const { runner } = createRunner(processRunner, []);

    await expect(runner.run(createJob())).rejects.toThrow('nothing to run with');
    expect(processRunner.spawnCalls).toHaveLength(0);
  });
});

describe('FfmpegJobRunner#run stats', () => {
  test('Records every attempt', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 218 }, { exitCode: 0 }]);
    const { runner, records } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob());

    expect(records.map((record) => [record.accel, record.verdict])).toEqual([[CUDA.id, 'failed'], ['software', 'ok']]);
  });

  test('Marks a decoder silently falling back to software as degraded', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 0, logLines: ['[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.'] },
    ]);
    const { runner, records } = createRunner(processRunner, [CUDA]);

    await runner.run(createJob());

    expect(records[0].verdict).toBe('degraded');
  });

  test('Records how a process the job kept running eventually ends', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const { runner, records } = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ awaitOutcome: async (_handle, accel) => accel.id }));
    expect(records).toHaveLength(0);

    processRunner.childProcesses[0].simulateClose(190);
    await new Promise((resolve) => setImmediate(resolve));

    expect(records[0].verdict).toBe('ready-then-failed');
  });

  test('Notices a decoder falling back to software only after the job had what it needed', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const { runner, records } = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ awaitOutcome: async (_handle, accel) => accel.id }));
    processRunner.childProcesses[0].stderr.write('[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.\n');
    await new Promise((resolve) => setImmediate(resolve));
    processRunner.childProcesses[0].simulateClose(0);
    await new Promise((resolve) => setImmediate(resolve));

    expect(records.map((record) => record.verdict)).toEqual(['degraded']);
  });

  test('Being stopped by its owner is not a failure of the process the job kept running, but not a success either', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const { runner, records } = createRunner(processRunner, [CUDA]);

    let runningHandle: FfmpegHandle | null = null;
    await runner.run(createJob({ awaitOutcome: async (handle, accel) => {
      runningHandle = handle;
      return accel.id;
    } }));
    await runningHandle!.kill();

    expect(records.map((record) => record.verdict)).toEqual(['stopped']);
  });

  test('Being killed by something else – the OOM killer, say – is a failure of the process the job kept running', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const { runner, records } = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ awaitOutcome: async (_handle, accel) => accel.id }));
    processRunner.childProcesses[0].simulateClose(null, 'SIGKILL');
    await new Promise((resolve) => setImmediate(resolve));

    expect(records.map((record) => record.verdict)).toEqual(['ready-then-failed']);
  });
});

describe('FfmpegJobRunner#run output handling', () => {
  test('Discards what a failed attempt left behind before retrying', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => undefined);

    await runner.run(createJob({ discardOutput }));

    expect(discardOutput).toHaveBeenCalledOnce();
  });

  test('Does not discard anything before the first attempt', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => undefined);

    await runner.run(createJob({ discardOutput }));

    expect(discardOutput).not.toHaveBeenCalled();
  });

  test('A cleanup failure costs neither the fallback nor the real error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => {
      throw new Error('EBUSY');
    });

    await expect(runner.run(createJob({ discardOutput }))).resolves.toBe('software');
  });

  test('Cleans up after the last attempt failed, so an exhausted job leaves nothing behind', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 2 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => undefined);

    await expect(runner.run(createJob({ discardOutput }))).rejects.toThrow();

    expect(discardOutput).toHaveBeenCalledTimes(2);
  });

  test('Cleans up after a failure that is not worth retrying', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1, logLines: [`[fatal] File 'out.mp4' already exists. Exiting.`] }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => undefined);

    await expect(runner.run(createJob({ discardOutput }))).rejects.toThrow();

    expect(discardOutput).toHaveBeenCalledOnce();
  });
});

describe('FfmpegJobRunner#run when a job rules out retrying', () => {
  test('Stops after the attempt that raised it', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }, { exitCode: 0 }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    const runPromise = runner.run(createJob({
      awaitOutcome: async () => {
        throw new UnretryableFfmpegJobError('waited long enough');
      },
    }));

    await expect(runPromise).rejects.toThrow('waited long enough');
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Still kills the process it gave up on', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const { runner } = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob({
      awaitOutcome: async () => {
        throw new UnretryableFfmpegJobError('waited long enough');
      },
    }))).rejects.toThrow();

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual(['SIGKILL']);
  });
});
