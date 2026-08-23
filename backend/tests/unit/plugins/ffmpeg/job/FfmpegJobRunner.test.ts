import { beforeEach, describe, expect, test, vi } from 'vitest';
import type FfmpegAccelerationPlanner from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegAccelerationPlanner.js';
import type { FfmpegAccelerationProfile } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegAccelerationPlanner.js';
import type { FfmpegJob } from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJob.js';
import FfmpegJobRunner from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import UnretryableFfmpegJobError from '../../../../../src/plugins/official/ffmpeg/job/UnretryableFfmpegJobError.js';
import FfmpegHandle from '../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type FfmpegProcessRunner from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import type { FfmpegSpawnOptions } from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import FakeChildProcess from '../process/FakeChildProcess.js';

const CUDA: FfmpegAccelerationProfile = { id: 'cuda', decodeAcceleration: 'cuda', videoEncoder: null };
const SOFTWARE: FfmpegAccelerationProfile = { id: 'software', decodeAcceleration: null, videoEncoder: null };

type ScriptedAttempt = {
  readonly exitCode: number;
  readonly logLines?: readonly string[];
  /** Leaves the process running, as a live transcode would. */
  readonly neverExits?: boolean;
};

class FakeProcessRunner {
  readonly spawnCalls: { args: readonly string[]; options?: FfmpegSpawnOptions }[] = [];
  readonly childProcesses: FakeChildProcess[] = [];

  constructor(private readonly script: readonly ScriptedAttempt[]) {
  }

  spawn(args: readonly string[], options?: FfmpegSpawnOptions): FfmpegHandle {
    const scriptedAttempt = this.script[this.spawnCalls.length] ?? { exitCode: 0 };
    this.spawnCalls.push({ args, options });

    const childProcess = new FakeChildProcess();
    this.childProcesses.push(childProcess);
    childProcess.on('killed', () => childProcess.simulateClose(null, 'SIGKILL'));
    const handle = new FfmpegHandle(childProcess.asChildProcess(), args, { captureFullLog: false, captureStdout: false });

    // Two ticks, so the log lines reach the buffer before the exit resolves whoever is waiting on it
    setImmediate(() => {
      for (const logLine of scriptedAttempt.logLines ?? []) {
        childProcess.stderr.write(`${logLine}\n`);
      }
      setImmediate(() => {
        if (scriptedAttempt.neverExits !== true) {
          childProcess.simulateClose(scriptedAttempt.exitCode);
        }
      });
    });

    return handle;
  }

  asFfmpegProcessRunner(): FfmpegProcessRunner {
    return this as unknown as FfmpegProcessRunner;
  }
}

function createRunner(processRunner: FakeProcessRunner, profiles: FfmpegAccelerationProfile[]): FfmpegJobRunner {
  const planner = { plan: async () => profiles } as unknown as FfmpegAccelerationPlanner;
  return new FfmpegJobRunner(processRunner.asFfmpegProcessRunner(), planner);
}

/** Fails the attempt on a non-zero exit code, like the frame extracting jobs do. */
function createJob(overrides: Partial<FfmpegJob<string>> = {}): FfmpegJob<string> {
  return {
    name: 'test-job',
    acceleration: { mayUseHardwareDecoding: true },

    buildArgs: (profile) => ['-i', 'input.mkv', '--profile', profile.id],

    awaitOutcome: async (handle, profile) => {
      const exitResult = await handle.waitForExit();
      if (exitResult.exitCode !== 0) {
        throw new Error(`exited with ${exitResult.exitCode}`);
      }
      return profile.id;
    },

    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('FfmpegJobRunner#run', () => {
  test('Stops at the first profile that works', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe('cuda');
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Builds the arguments for the profile it is attempting', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob());

    expect(processRunner.spawnCalls[0].args).toContain('cuda');
    expect(processRunner.spawnCalls[1].args).toContain('software');
  });

  test('Falls back to the next profile when an attempt fails', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 218 }, { exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe('software');
  });

  test('Passes the spawn options of the job through', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ spawnOptions: { cwd: '/tmp/work', logVerbosity: 'debug' } }));

    expect(processRunner.spawnCalls[0].options).toEqual({ cwd: '/tmp/work', logVerbosity: 'debug' });
  });

  test('Throws the failure of the last profile once every one of them failed', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 2 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

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
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

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
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe('software');
    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Keeps retrying when the hardware failure was the fatal one', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 255, logLines: ['[fatal] Error parsing global options: Operation not permitted'] },
      { exitCode: 0 },
    ]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).resolves.toBe('software');
  });

  test('Gives up right away when ffmpeg refuses to overwrite its output', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 1, logLines: [`[fatal] File 'out.mp4' already exists. Exiting.`] },
      { exitCode: 0 },
    ]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob())).rejects.toThrow();
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Kills a process the job gave up on', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }, { exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await runner.run(createJob({
      awaitOutcome: async (handle, profile) => {
        if (profile.decodeAcceleration != null) {
          throw new Error('gave up while ffmpeg was still running');
        }
        await handle.waitForExit();
        return profile.id;
      },
    }));

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual(['SIGKILL']);
  });

  test('Leaves a process the job is still using alone', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const runner = createRunner(processRunner, [CUDA]);

    await runner.run(createJob({ awaitOutcome: async (_handle, profile) => profile.id }));

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual([]);
  });
});

describe('FfmpegJobRunner#run output handling', () => {
  test('Discards what a failed attempt left behind before retrying', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => undefined);

    await runner.run(createJob({ discardOutput }));

    expect(discardOutput).toHaveBeenCalledOnce();
  });

  test('Does not discard anything before the first attempt', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);
    const discardOutput = vi.fn(async () => undefined);

    await runner.run(createJob({ discardOutput }));

    expect(discardOutput).not.toHaveBeenCalled();
  });
});

describe('FfmpegJobRunner#run when a job rules out retrying', () => {
  test('Stops after the attempt that raised it', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }, { exitCode: 0 }]);
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

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
    const runner = createRunner(processRunner, [CUDA, SOFTWARE]);

    await expect(runner.run(createJob({
      awaitOutcome: async () => {
        throw new UnretryableFfmpegJobError('waited long enough');
      },
    }))).rejects.toThrow();

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual(['SIGKILL']);
  });
});
