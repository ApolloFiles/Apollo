import type { Mock } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { type Accel, SOFTWARE } from '#src/plugins/official/ffmpeg/accel/Accel.js';
import type FfmpegCapabilityCache from '#src/plugins/official/ffmpeg/accel/FfmpegCapabilityCache.js';
import { createFfmpegDevice } from '#src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import HwContext from '#src/plugins/official/ffmpeg/accel/HwContext.js';
import type FfmpegCandidatePlanner from '#src/plugins/official/ffmpeg/job/FfmpegCandidatePlanner.js';
import type { FfmpegJob } from '#src/plugins/official/ffmpeg/job/FfmpegJob.js';
import FfmpegJobRunner from '#src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import type FfmpegJobStats from '#src/plugins/official/ffmpeg/job/FfmpegJobStats.js';
import type { FfmpegAttemptRecord } from '#src/plugins/official/ffmpeg/job/FfmpegJobStats.js';
import UnretryableFfmpegJobError from '#src/plugins/official/ffmpeg/job/UnretryableFfmpegJobError.js';
import type FfmpegHandle from '#src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import { flushStreams } from '#tests/unit/plugins/ffmpeg/process/FakeChildProcess.js';
import FakeProcessRunner from '#tests/unit/plugins/ffmpeg/process/FakeProcessRunner.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const CUDA_DEVICE = createFfmpegDevice('cuda', '0', 'nvidia');
const CUDA = new HwContext(CUDA_DEVICE, 'fullChain', 8);

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

async function returnOnceExited(handle: FfmpegHandle, accel: Accel): Promise<string> {
  await handle.waitForExit();
  return accel.id;
}

describe(FfmpegJobRunner, () => {
  let candidatePlanner: DeepMockProxy<FfmpegCandidatePlanner>;
  let capabilityCache: DeepMockProxy<FfmpegCapabilityCache>;
  let stats: DeepMockProxy<FfmpegJobStats>;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    candidatePlanner = createStrictDeepMock<FfmpegCandidatePlanner>();
    candidatePlanner.plan.mockResolvedValue([CUDA, SOFTWARE]);
    capabilityCache = createStrictDeepMock<FfmpegCapabilityCache>();
    capabilityCache.forgetDevice.mockReturnValue(undefined);
    stats = createStrictDeepMock<FfmpegJobStats>();
    stats.record.mockReturnValue(undefined);
  });

  function createRunner(processRunner: FakeProcessRunner): FfmpegJobRunner {
    return new FfmpegJobRunner(processRunner.asFfmpegProcessRunner(), candidatePlanner, capabilityCache, stats);
  }

  function recordedAttempts(): FfmpegAttemptRecord[] {
    return stats.record.mock.calls.map(([record]) => record);
  }

  test('Stops at the first candidate that works', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).resolves.toBe('cuda:0/fullChain');
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Builds the arguments for the candidate it is attempting', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const runner = createRunner(processRunner);

    await runner.run(createJob());

    expect(processRunner.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ['-i', 'input.mkv', '--accel', 'cuda:0/fullChain'],
      ['-i', 'input.mkv', '--accel', 'software'],
    ]);
  });

  test('Falls back to the next candidate when an attempt fails', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 218 }, { exitCode: 0 }]);
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).resolves.toBe('software');
  });

  test('Passes the spawn options of the job through', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const runner = createRunner(processRunner);

    await runner.run(createJob({ spawnOptions: { cwd: '/tmp/work', logVerbosity: 'debug' } }));

    expect(processRunner.spawnCalls[0].options).toEqual({ cwd: '/tmp/work', logVerbosity: 'debug' });
  });

  test('Throws the failure of the last candidate once every one of them failed', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 2 }]);
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).rejects.toThrow(new Error('exited with 2'));
    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Fails instead of quietly doing nothing when there are no candidates', async () => {
    candidatePlanner.plan.mockResolvedValue([]);
    const processRunner = new FakeProcessRunner([]);
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).rejects.toThrow(new Error(`FFmpeg job 'test-job' had nothing to run with`));
    expect(processRunner.spawnCalls).toHaveLength(0);
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
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).rejects.toThrow(new Error('exited with 254'));
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
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).resolves.toBe('software');
    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Gives up right away when ffmpeg refuses to overwrite its output', async () => {
    const processRunner = new FakeProcessRunner([
      { exitCode: 1, logLines: [`[fatal] File 'out.mp4' already exists. Exiting.`] },
      { exitCode: 0 },
    ]);
    const runner = createRunner(processRunner);

    await expect(runner.run(createJob())).rejects.toThrow(new Error('exited with 1'));
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Fails an attempt the moment its process dies, even while the job is still waiting for something else', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]);
    const runner = createRunner(processRunner);
    const awaitOutcome = vi.fn<FfmpegJob<string>['awaitOutcome']>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementationOnce(returnOnceExited);

    await expect(runner.run(createJob({ awaitOutcome }))).resolves.toBe('software');
  });

  test('Kills a process the job gave up on', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }, { exitCode: 0 }]);
    const runner = createRunner(processRunner);
    const awaitOutcome = vi.fn<FfmpegJob<string>['awaitOutcome']>()
      .mockRejectedValueOnce(new Error('gave up while ffmpeg was still running'))
      .mockImplementationOnce(returnOnceExited);

    await runner.run(createJob({ awaitOutcome }));

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual(['SIGKILL']);
  });

  test('Leaves a process the job is still using alone', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
    const runner = createRunner(processRunner);

    await runner.run(createJob({ awaitOutcome: async (_handle, accel) => accel.id }));

    expect(processRunner.childProcesses[0].receivedKillSignals).toEqual([]);
  });

  describe('when a hardware attempt fails', () => {
    test('Has the device probed again when it could not be created although its probes passed', async () => {
      const processRunner = new FakeProcessRunner([
        { exitCode: 255, logLines: ['[AVHWDeviceContext @ 0x1] [error] Cannot load libcuda.so.1', '[error] Device creation failed: -1.'] },
        { exitCode: 0 },
      ]);
      const runner = createRunner(processRunner);

      await runner.run(createJob());

      expect(capabilityCache.forgetDevice).toHaveBeenCalledExactlyOnceWith(CUDA_DEVICE);
    });

    test('Keeps what it knows about the device when only the decoder cannot handle the file', async () => {
      const processRunner = new FakeProcessRunner([
        { exitCode: 69, logLines: ['[av1 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.'] },
        { exitCode: 0 },
      ]);
      const runner = createRunner(processRunner);

      await runner.run(createJob());

      expect(capabilityCache.forgetDevice).not.toHaveBeenCalled();
    });

    test(`Keeps what it knows about the device when NVDEC rejects one file's surface count`, async () => {
      const processRunner = new FakeProcessRunner([
        {
          exitCode: 218,
          logLines: [
            '[h264 @ 0x1] [error] decoder->cvdl->cuvidCreateDecoder(&decoder->decoder, params) failed -> CUDA_ERROR_INVALID_VALUE: invalid argument',
            '[h264 @ 0x1] [warning] Using more than 32 (36) decode surfaces might cause nvdec to fail.',
            '[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.',
            '[error] Error while filtering: Function not implemented',
          ],
        },
        { exitCode: 0 },
      ]);
      const runner = createRunner(processRunner);

      await runner.run(createJob());

      expect(capabilityCache.forgetDevice).not.toHaveBeenCalled();
      expect(recordedAttempts()[0]).toMatchObject({ verdict: 'failed', failureKind: 'decoder' });
    });
  });

  describe('when the job cannot build its arguments', () => {
    test('Fails without trying another candidate, but leaves a record', async () => {
      const processRunner = new FakeProcessRunner([]);
      const runner = createRunner(processRunner);
      const buildArgs = vi.fn<FfmpegJob<string>['buildArgs']>().mockImplementation(() => {
        throw new Error('no video stream');
      });

      await expect(runner.run(createJob({ buildArgs }))).rejects.toThrow(new Error('no video stream'));
      expect(processRunner.spawnCalls).toHaveLength(0);
      expect(recordedAttempts()).toMatchObject([{ accel: 'cuda:0/fullChain', verdict: 'failed', failureKind: 'aborted' }]);
    });

    test('Records whatever was thrown, even when it is not an Error', async () => {
      candidatePlanner.plan.mockResolvedValue([CUDA]);
      const runner = createRunner(new FakeProcessRunner([]));
      const buildArgs = vi.fn<FfmpegJob<string>['buildArgs']>().mockImplementation(() => {
        throw 'not even an Error';
      });

      await expect(runner.run(createJob({ buildArgs }))).rejects.toBe('not even an Error');
      expect(recordedAttempts()).toMatchObject([{ logProblems: 'not even an Error' }]);
    });
  });

  describe('recording attempts', () => {
    test('Records every attempt', async () => {
      const runner = createRunner(new FakeProcessRunner([{ exitCode: 218 }, { exitCode: 0 }]));

      await runner.run(createJob());

      expect(recordedAttempts()).toMatchObject([
        { accel: 'cuda:0/fullChain', verdict: 'failed' },
        { accel: 'software', verdict: 'ok' },
      ]);
    });

    test('Marks a decoder silently falling back to software as degraded', async () => {
      candidatePlanner.plan.mockResolvedValue([CUDA]);
      const runner = createRunner(new FakeProcessRunner([
        { exitCode: 0, logLines: ['[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.'] },
      ]));

      await runner.run(createJob());

      expect(recordedAttempts()).toMatchObject([{ verdict: 'degraded' }]);
    });

    describe('for a process the job kept running', () => {
      let processRunner: FakeProcessRunner;
      let keptHandle: FfmpegHandle | undefined;

      beforeEach(async () => {
        candidatePlanner.plan.mockResolvedValue([CUDA]);
        processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
        keptHandle = undefined;
        await createRunner(processRunner).run(createJob({
          awaitOutcome: async (handle, accel) => {
            keptHandle = handle;
            return accel.id;
          },
        }));
      });

      test('Records a failure once it dies with an error exit', async () => {
        processRunner.childProcesses[0].simulateClose(190);
        await flushStreams();

        expect(recordedAttempts()).toMatchObject([{ verdict: 'ready-then-failed' }]);
      });

      test('Notices a decoder falling back to software only after the job had what it needed', async () => {
        processRunner.childProcesses[0].stderr.write('[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.\n');
        await flushStreams();
        processRunner.childProcesses[0].simulateClose(0);
        await flushStreams();

        expect(recordedAttempts()).toMatchObject([{ verdict: 'degraded' }]);
      });

      test('Records being stopped by its owner as neither a failure nor a success', async () => {
        await keptHandle?.kill();

        expect(recordedAttempts()).toMatchObject([{ verdict: 'stopped' }]);
      });

      test('Records being killed by something else – the OOM killer, say – as a failure', async () => {
        processRunner.childProcesses[0].simulateClose(null, 'SIGKILL');
        await flushStreams();

        expect(recordedAttempts()).toMatchObject([{ verdict: 'ready-then-failed' }]);
      });
    });
  });

  describe('cleaning up after failed attempts', () => {
    let discardOutput: Mock<NonNullable<FfmpegJob<string>['discardOutput']>>;

    beforeEach(() => {
      discardOutput = vi.fn<NonNullable<FfmpegJob<string>['discardOutput']>>().mockResolvedValue(undefined);
    });

    test('Discards what a failed attempt left behind before retrying', async () => {
      const runner = createRunner(new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]));

      await runner.run(createJob({ discardOutput }));

      expect(discardOutput).toHaveBeenCalledExactlyOnceWith();
    });

    test('Does not discard anything before the first attempt', async () => {
      const runner = createRunner(new FakeProcessRunner([{ exitCode: 0 }]));

      await runner.run(createJob({ discardOutput }));

      expect(discardOutput).not.toHaveBeenCalled();
    });

    test('Costs neither the fallback nor the real error when the cleanup fails, but logs it', async () => {
      discardOutput.mockRejectedValue(new Error('EBUSY'));
      const runner = createRunner(new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 0 }]));

      await expect(runner.run(createJob({ discardOutput }))).resolves.toBe('software');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('could not discard the output'), new Error('EBUSY'));
    });

    test('Cleans up after the last attempt failed, so an exhausted job leaves nothing behind', async () => {
      const runner = createRunner(new FakeProcessRunner([{ exitCode: 1 }, { exitCode: 2 }]));

      await expect(runner.run(createJob({ discardOutput }))).rejects.toThrow(new Error('exited with 2'));
      expect(discardOutput).toHaveBeenCalledTimes(2);
    });

    test('Cleans up after a failure that is not worth retrying', async () => {
      const runner = createRunner(new FakeProcessRunner([{ exitCode: 1, logLines: [`[fatal] File 'out.mp4' already exists. Exiting.`] }]));

      await expect(runner.run(createJob({ discardOutput }))).rejects.toThrow(new Error('exited with 1'));
      expect(discardOutput).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('when the job rules out retrying', () => {
    test('Stops after the attempt that raised it', async () => {
      const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }, { exitCode: 0 }]);
      const runner = createRunner(processRunner);
      const awaitOutcome = vi.fn<FfmpegJob<string>['awaitOutcome']>().mockRejectedValue(new UnretryableFfmpegJobError('waited long enough'));

      await expect(runner.run(createJob({ awaitOutcome }))).rejects.toThrow(new UnretryableFfmpegJobError('waited long enough'));
      expect(processRunner.spawnCalls).toHaveLength(1);
    });

    test('Still kills the process it gave up on', async () => {
      const processRunner = new FakeProcessRunner([{ exitCode: 0, neverExits: true }]);
      const runner = createRunner(processRunner);
      const awaitOutcome = vi.fn<FfmpegJob<string>['awaitOutcome']>().mockRejectedValue(new UnretryableFfmpegJobError('waited long enough'));

      await expect(runner.run(createJob({ awaitOutcome }))).rejects.toThrow(new UnretryableFfmpegJobError('waited long enough'));
      expect(processRunner.childProcesses[0].receivedKillSignals).toEqual(['SIGKILL']);
    });
  });
});
