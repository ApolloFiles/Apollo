import FfmpegHandle, { type FfmpegHandleOptions } from '#src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type { FfmpegLogLine } from '#src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';
import type { FfmpegProgress } from '#src/plugins/official/ffmpeg/process/FfmpegProgressParser.js';
import FakeChildProcess, { flushStreams } from './FakeChildProcess.js';

const PROGRESS_BLOCK = 'frame=75\nfps=24.50\nout_time_us=2920000\nspeed=31.9x\nprogress=continue\n';

describe(FfmpegHandle, () => {
  let childProcess: FakeChildProcess;

  beforeEach(() => {
    childProcess = new FakeChildProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createHandle(options: Partial<FfmpegHandleOptions> = {}): FfmpegHandle {
    return new FfmpegHandle(childProcess.asChildProcess(), ['-i', 'input.mkv'], {
      captureFullLog: false,
      captureStdout: false,
      ...options,
    });
  }

  describe('reading the log', () => {
    test('Emits log lines that arrive split across chunk boundaries', async () => {
      const handle = createHandle();
      const logLines: FfmpegLogLine[] = [];
      handle.on('log', (logLine) => logLines.push(logLine));

      childProcess.stderr.write('[info] first line\n[warn');
      await flushStreams();
      childProcess.stderr.write('ing] second line\n');
      await flushStreams();

      expect(logLines).toMatchObject([
        { level: 'info', message: 'first line' },
        { level: 'warning', message: 'second line' },
      ]);
    });

    test('Ignores a line that never got terminated', async () => {
      const handle = createHandle();
      const logLines: FfmpegLogLine[] = [];
      handle.on('log', (logLine) => logLines.push(logLine));

      childProcess.stderr.write('[info] incomplete');
      await flushStreams();

      expect(logLines).toEqual([]);
    });

    test('Keeps warnings and errors around after they fell out of the log tail', async () => {
      const handle = createHandle();
      const noise = Array.from({ length: 100 }, (_, i) => `[debug] noise ${i}\n`).join('');

      childProcess.stderr.write(`[error] the actual failure reason\n${noise}`);
      await flushStreams();

      expect(handle.getLogTail()).not.toContain('the actual failure reason');
      expect(handle.getLogProblems()).toBe('[error] the actual failure reason');
    });

    test('Does not collect the full log unless asked to', async () => {
      const handle = createHandle();

      childProcess.stderr.write('[info] hello\n');
      await flushStreams();

      expect(handle.getFullLog()).toBeNull();
    });

    test('Collects the full log when asked to', async () => {
      const handle = createHandle({ captureFullLog: true });

      childProcess.stderr.write('[info] hello\n[info] world\n');
      await flushStreams();

      expect(handle.getFullLog()).toBe('[info] hello\n[info] world');
    });

    test('Logs a failure to read the process output instead of losing the exit result', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const handle = createHandle();

      childProcess.stderr.destroy(new Error('EIO'));
      await flushStreams();
      childProcess.emit('close', 0, null);

      await expect(handle.waitForExit()).resolves.toMatchObject({ exitCode: 0 });
      expect(console.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Failed to read the output'), new Error('EIO'));
    });
  });

  describe('reading progress', () => {
    test('Emits a progress update once its block is complete', async () => {
      const handle = createHandle();
      const progressUpdates: FfmpegProgress[] = [];
      handle.on('progress', (progress) => progressUpdates.push(progress));

      childProcess.progress.write(PROGRESS_BLOCK);
      await flushStreams();

      expect(progressUpdates).toMatchObject([{ frame: 75, fps: 24.5, outTimeInMillis: 2920, speed: 31.9 }]);
      expect(handle.getLastProgress()).toBe(progressUpdates[0]);
    });

    test('Remembers the highest reported fps', async () => {
      const handle = createHandle();

      childProcess.progress.write('fps=30.0\nprogress=continue\n');
      childProcess.progress.write('fps=80.5\nprogress=continue\n');
      childProcess.progress.write('fps=12.0\nprogress=end\n');
      await flushStreams();

      expect(handle.getStats().peakFps).toBe(80.5);
    });

    test('Reports no progress before the first block arrives', () => {
      const handle = createHandle();

      expect(handle.getLastProgress()).toBeNull();
      expect(handle.getStats().peakFps).toBeNull();
    });
  });

  describe('capturing stdout', () => {
    test('Refuses to hand out stdout that was not captured', async () => {
      const handle = createHandle();

      childProcess.stdout.write('some output\n');
      await flushStreams();

      expect(() => handle.getStdout()).toThrow(/not captured/);
    });

    test('Captures stdout when asked to', async () => {
      const handle = createHandle({ captureStdout: true });

      childProcess.stdout.write('first\n');
      childProcess.stdout.write('second\n');
      await flushStreams();

      expect(handle.getStdout()).toBe('first\nsecond\n');
    });
  });

  describe('when the process exits', () => {
    test('Resolves with the exit code', async () => {
      const handle = createHandle();

      childProcess.simulateClose(0);

      await expect(handle.waitForExit()).resolves.toMatchObject({ exitCode: 0, signal: null });
      expect(handle.hasExited()).toBe(true);
      expect(handle.getExitResult()).toMatchObject({ exitCode: 0 });
    });

    test('Resolves a non-zero exit code instead of rejecting', async () => {
      const handle = createHandle();

      childProcess.simulateClose(254);

      await expect(handle.waitForExit()).resolves.toMatchObject({ exitCode: 254 });
    });

    test('Reports the signal a killed process died from', async () => {
      const handle = createHandle();

      childProcess.simulateClose(null, 'SIGKILL');

      await expect(handle.waitForExit()).resolves.toMatchObject({ exitCode: null, signal: 'SIGKILL' });
    });

    test('Measures the runtime', async () => {
      vi.useFakeTimers({ toFake: ['performance'] });
      const handle = createHandle();
      vi.advanceTimersByTime(1_500);

      childProcess.simulateClose(0);

      await expect(handle.waitForExit()).resolves.toMatchObject({ runtimeInMillis: 1_500 });
      expect(handle.getStats().runtimeInMillis).toBe(1_500);
    });
  });

  describe('when the process could not be spawned', () => {
    test('Rejects with the spawn error', async () => {
      const handle = createHandle();

      childProcess.simulateSpawnFailure(new Error('spawn ffmpeg ENOENT'));

      await expect(handle.waitForExit()).rejects.toThrow(new Error('spawn ffmpeg ENOENT'));
    });

    test('Does not resolve with a close that follows the spawn failure', async () => {
      const handle = createHandle();

      childProcess.simulateSpawnFailure(new Error('spawn ffmpeg ENOENT'));
      childProcess.simulateClose(null);

      await expect(handle.waitForExit()).rejects.toThrow(new Error('spawn ffmpeg ENOENT'));
      expect(handle.getExitResult()).toBeNull();
    });
  });

  describe('while the process is running', () => {
    test('Reports it as running', () => {
      const handle = createHandle();

      expect(handle.hasExited()).toBe(false);
      expect(handle.getExitResult()).toBeNull();
    });

    test('Does not count it as crashed', () => {
      const handle = createHandle();

      expect(handle.crashed()).toBe(false);
    });
  });

  describe('when asked to shut down', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    test('Asks the process to terminate right away', () => {
      const handle = createHandle();

      void handle.shutdown(5_000);

      expect(childProcess.receivedKillSignals).toEqual(['SIGTERM']);
    });

    test('Resolves with the exit of a process that terminates in time', async () => {
      const handle = createHandle();

      const shutdownPromise = handle.shutdown(5_000);
      childProcess.simulateClose(255);

      await expect(shutdownPromise).resolves.toMatchObject({ exitCode: 255 });
    });

    test('Does not force-kill a process that terminated in time', async () => {
      const handle = createHandle();
      const shutdownPromise = handle.shutdown(5_000);
      childProcess.simulateClose(255);
      await shutdownPromise;

      await vi.advanceTimersByTimeAsync(5_000);

      expect(childProcess.receivedKillSignals).toEqual(['SIGTERM']);
    });

    test('Force-kills a process that ignores the grace period', async () => {
      const handle = createHandle();
      void handle.shutdown(5_000);

      await vi.advanceTimersByTimeAsync(5_000);

      expect(childProcess.receivedKillSignals).toEqual(['SIGTERM', 'SIGKILL']);
    });

    test('Resolves with the exit of a force-killed process', async () => {
      const handle = createHandle();
      const shutdownPromise = handle.shutdown(5_000);
      await vi.advanceTimersByTimeAsync(5_000);

      childProcess.simulateClose(null, 'SIGKILL');

      await expect(shutdownPromise).resolves.toMatchObject({ signal: 'SIGKILL' });
    });

    test('Does not signal an already exited process', async () => {
      const handle = createHandle();
      childProcess.simulateClose(0);
      await handle.waitForExit();

      const shutdownPromise = handle.shutdown();

      await expect(shutdownPromise).resolves.toMatchObject({ exitCode: 0 });
      expect(childProcess.receivedKillSignals).toEqual([]);
    });
  });

  describe('when killed', () => {
    test('Force-kills the process right away', () => {
      const handle = createHandle();

      void handle.kill();

      expect(childProcess.receivedKillSignals).toEqual(['SIGKILL']);
    });

    test('Resolves with the exit of the killed process', async () => {
      const handle = createHandle();
      const killPromise = handle.kill();

      childProcess.simulateClose(null, 'SIGKILL');

      await expect(killPromise).resolves.toMatchObject({ signal: 'SIGKILL' });
    });

    test('Does not signal an already exited process', async () => {
      const handle = createHandle();
      childProcess.simulateClose(0);
      await handle.waitForExit();

      const killPromise = handle.kill();

      await expect(killPromise).resolves.toMatchObject({ exitCode: 0 });
      expect(childProcess.receivedKillSignals).toEqual([]);
    });
  });

  describe('deciding whether the process crashed', () => {
    test('Does not count a clean exit as a crash', async () => {
      const handle = createHandle();

      childProcess.simulateClose(0);
      await handle.waitForExit();

      expect(handle.crashed()).toBe(false);
    });

    test('Counts an error exit nobody asked for as a crash', async () => {
      const handle = createHandle();

      childProcess.simulateClose(190);
      await handle.waitForExit();

      expect(handle.crashed()).toBe(true);
    });

    test('Counts a signal nobody sent – the OOM killer, say – as a crash', async () => {
      const handle = createHandle();

      childProcess.simulateClose(null, 'SIGKILL');
      await handle.waitForExit();

      expect(handle.crashed()).toBe(true);
    });

    test('Does not count dying from the signal it sent as a crash', async () => {
      const handle = createHandle();
      childProcess.on('killed', () => childProcess.simulateClose(null, 'SIGKILL'));

      await handle.kill();

      expect(handle.crashed()).toBe(false);
    });

    test('Does not count an error exit after being asked to shut down as a crash', async () => {
      const handle = createHandle();
      childProcess.on('killed', () => childProcess.simulateClose(255));

      await handle.shutdown();

      expect(handle.crashed()).toBe(false);
    });
  });
});
