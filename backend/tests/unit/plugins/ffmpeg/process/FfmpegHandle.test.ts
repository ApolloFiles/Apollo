import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegHandle, { type FfmpegHandleOptions } from '../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type { FfmpegLogLine } from '../../../../../src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';
import type { FfmpegProgress } from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProgressParser.js';
import FakeChildProcess, { flushStreams } from './FakeChildProcess.js';

const PROGRESS_BLOCK = 'frame=75\nfps=24.50\nout_time_us=2920000\nspeed=31.9x\nprogress=continue\n';

let childProcess: FakeChildProcess;

function createHandle(options: Partial<FfmpegHandleOptions> = {}): FfmpegHandle {
  return new FfmpegHandle(childProcess.asChildProcess(), ['-i', 'input.mkv'], {
    captureFullLog: false,
    captureStdout: false,
    ...options,
  });
}

beforeEach(() => {
  childProcess = new FakeChildProcess();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FfmpegHandle log handling', () => {
  test('Emits log lines that arrive split across chunk boundaries', async () => {
    const handle = createHandle();
    const logLines: FfmpegLogLine[] = [];
    handle.on('log', (logLine) => logLines.push(logLine));

    childProcess.stderr.write('[info] first line\n[warn');
    await flushStreams();
    childProcess.stderr.write('ing] second line\n');
    await flushStreams();

    expect(logLines.map((logLine) => [logLine.level, logLine.message])).toEqual([
      ['info', 'first line'],
      ['warning', 'second line'],
    ]);
  });

  test('Ignores a line that never got terminated', async () => {
    const handle = createHandle();
    const logLines: FfmpegLogLine[] = [];
    handle.on('log', (logLine) => logLines.push(logLine));

    childProcess.stderr.write('[info] incomplete');
    await flushStreams();

    expect(logLines).toHaveLength(0);
  });

  test('Keeps warnings and errors around after they fell out of the log tail', async () => {
    const handle = createHandle();

    childProcess.stderr.write('[error] the actual failure reason\n');
    for (let i = 0; i < 100; ++i) {
      childProcess.stderr.write(`[debug] noise ${i}\n`);
    }
    await flushStreams();

    expect(handle.getLogTail()).not.toContain('the actual failure reason');
    expect(handle.getLogProblems()).toContain('the actual failure reason');
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
});

describe('FfmpegHandle stream failures', () => {
  test('Logs a failure to read the process output instead of losing the exit result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handle = createHandle();

    childProcess.stderr.destroy(new Error('EIO'));
    await flushStreams();
    childProcess.emit('close', 0, null);

    expect(await handle.waitForExit()).toMatchObject({ exitCode: 0 });
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe('FfmpegHandle progress handling', () => {
  test('Emits a progress update once its block is complete', async () => {
    const handle = createHandle();
    const progressUpdates: FfmpegProgress[] = [];
    handle.on('progress', (progress) => progressUpdates.push(progress));

    childProcess.progress.write(PROGRESS_BLOCK);
    await flushStreams();

    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]).toMatchObject({ frame: 75, fps: 24.5, outTimeInMillis: 2920, speed: 31.9 });
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

describe('FfmpegHandle stdout capturing', () => {
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

describe('FfmpegHandle exit handling', () => {
  test('Resolves with the exit code', async () => {
    const handle = createHandle();

    childProcess.simulateClose(0);

    expect(await handle.waitForExit()).toMatchObject({ exitCode: 0, signal: null });
    expect(handle.hasExited()).toBe(true);
    expect(handle.getExitResult()).toMatchObject({ exitCode: 0 });
  });

  test('Resolves a non-zero exit code instead of rejecting', async () => {
    const handle = createHandle();

    childProcess.simulateClose(254);

    expect(await handle.waitForExit()).toMatchObject({ exitCode: 254 });
  });

  test('Reports the signal a killed process died from', async () => {
    const handle = createHandle();

    childProcess.simulateClose(null, 'SIGKILL');

    expect(await handle.waitForExit()).toMatchObject({ exitCode: null, signal: 'SIGKILL' });
  });

  test('Measures the runtime', async () => {
    const handle = createHandle();

    childProcess.simulateClose(0);
    const exitResult = await handle.waitForExit();

    expect(exitResult.runtimeInMillis).toBeGreaterThanOrEqual(0);
    expect(handle.getStats().runtimeInMillis).toBe(exitResult.runtimeInMillis);
  });

  test('Rejects when the process could not be spawned', async () => {
    const handle = createHandle();

    childProcess.simulateSpawnFailure(new Error('spawn ffmpeg ENOENT'));

    await expect(handle.waitForExit()).rejects.toThrow('spawn ffmpeg ENOENT');
  });

  test('Does not resolve with a close that follows a spawn failure', async () => {
    const handle = createHandle();

    childProcess.simulateSpawnFailure(new Error('spawn ffmpeg ENOENT'));
    childProcess.simulateClose(null);

    await expect(handle.waitForExit()).rejects.toThrow('spawn ffmpeg ENOENT');
    expect(handle.getExitResult()).toBeNull();
  });

  test('Reports a not yet exited process as running', () => {
    const handle = createHandle();

    expect(handle.hasExited()).toBe(false);
    expect(handle.getExitResult()).toBeNull();
  });
});

describe('FfmpegHandle#shutdown', () => {
  test('Asks the process to terminate before force-killing it', async () => {
    vi.useFakeTimers();
    const handle = createHandle();

    const shutdownPromise = handle.shutdown(5_000);
    expect(childProcess.receivedKillSignals).toEqual(['SIGTERM']);

    childProcess.simulateClose(255);
    await expect(shutdownPromise).resolves.toMatchObject({ exitCode: 255 });
    expect(childProcess.receivedKillSignals).toEqual(['SIGTERM']);
  });

  test('Force-kills a process that ignores the grace period', async () => {
    vi.useFakeTimers();
    const handle = createHandle();

    const shutdownPromise = handle.shutdown(5_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(childProcess.receivedKillSignals).toEqual(['SIGTERM', 'SIGKILL']);

    childProcess.simulateClose(null, 'SIGKILL');
    await expect(shutdownPromise).resolves.toMatchObject({ signal: 'SIGKILL' });
  });

  test('Does not signal an already exited process', async () => {
    const handle = createHandle();
    childProcess.simulateClose(0);
    await handle.waitForExit();

    expect(await handle.shutdown()).toMatchObject({ exitCode: 0 });
    expect(childProcess.receivedKillSignals).toEqual([]);
  });
});

describe('FfmpegHandle#kill', () => {
  test('Force-kills the process right away', async () => {
    const handle = createHandle();

    const killPromise = handle.kill();
    expect(childProcess.receivedKillSignals).toEqual(['SIGKILL']);

    childProcess.simulateClose(null, 'SIGKILL');
    await expect(killPromise).resolves.toMatchObject({ signal: 'SIGKILL' });
  });

  test('Does not signal an already exited process', async () => {
    const handle = createHandle();
    childProcess.simulateClose(0);
    await handle.waitForExit();

    expect(await handle.kill()).toMatchObject({ exitCode: 0 });
    expect(childProcess.receivedKillSignals).toEqual([]);
  });
});
