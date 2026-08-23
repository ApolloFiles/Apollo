import ChildProcess from 'node:child_process';
import Os from 'node:os';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegProcessRunner from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import FakeChildProcess from './FakeChildProcess.js';

vi.mock('node:child_process', () => ({
  default: { spawn: vi.fn() },
}));

const spawnMock = vi.mocked(ChildProcess.spawn);

function spawnedArgs(): string[] {
  return spawnMock.mock.calls[0][1] as string[];
}

function spawnedOptions(): ChildProcess.SpawnOptions {
  return spawnMock.mock.calls[0][2] as ChildProcess.SpawnOptions;
}

beforeEach(() => {
  spawnMock.mockImplementation(() => new FakeChildProcess().asChildProcess());
});

describe('FfmpegProcessRunner#spawn', () => {
  test('Runs the ffmpeg executable', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnMock.mock.calls[0][0]).toBe('ffmpeg');
  });

  test('Appends the callers arguments to the base arguments', () => {
    new FfmpegProcessRunner().spawn(['-i', 'input.mkv', 'output.mkv']);

    expect(spawnedArgs().slice(-3)).toEqual(['-i', 'input.mkv', 'output.mkv']);
  });

  test('Requests progress on a dedicated file descriptor', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedArgs()).toContain('-progress');
    expect(spawnedArgs()[spawnedArgs().indexOf('-progress') + 1]).toBe('pipe:3');
    expect(spawnedOptions().stdio).toEqual(['ignore', 'ignore', 'pipe', 'pipe']);
  });

  test('Disables the stats output that would otherwise share stderr with the log', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedArgs()).toContain('-nostats');
  });

  test('Keeps ffmpeg from touching stdin and from printing its banner', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedArgs()).toContain('-nostdin');
    expect(spawnedArgs()).toContain('-hide_banner');
  });

  test('Logs at info level with the level prefix by default', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedArgs()[spawnedArgs().indexOf('-loglevel') + 1]).toBe('level+info');
  });

  test('Keeps the level prefix when the caller raises the verbosity', () => {
    new FfmpegProcessRunner().spawn([], { logVerbosity: 'debug' });

    expect(spawnedArgs()[spawnedArgs().indexOf('-loglevel') + 1]).toBe('level+debug');
  });

  test('Reports progress once a second by default', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedArgs()[spawnedArgs().indexOf('-stats_period') + 1]).toBe('1');
  });

  test('Honors a custom progress period', () => {
    new FfmpegProcessRunner().spawn([], { progressPeriodInSeconds: 0.5 });

    expect(spawnedArgs()[spawnedArgs().indexOf('-stats_period') + 1]).toBe('0.5');
  });

  test('Pipes stdout only when it is supposed to be captured', () => {
    new FfmpegProcessRunner().spawn([], { captureStdout: true });

    expect(spawnedOptions().stdio).toEqual(['ignore', 'pipe', 'pipe', 'pipe']);
  });

  test('Falls back to the systems temporary directory when no working directory is given', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedOptions().cwd).toBe(Os.tmpdir());
  });

  test('Honors the given working directory', () => {
    new FfmpegProcessRunner().spawn([], { cwd: '/some/work/dir' });

    expect(spawnedOptions().cwd).toBe('/some/work/dir');
  });

  test('Force-kills a process that exceeds its timeout', () => {
    new FfmpegProcessRunner().spawn([], { timeoutInMillis: 15_000 });

    expect(spawnedOptions()).toMatchObject({ timeout: 15_000, killSignal: 'SIGKILL' });
  });

  test('Does not impose a timeout by default', () => {
    new FfmpegProcessRunner().spawn([]);

    expect(spawnedOptions().timeout).toBeUndefined();
  });

  test('Returns a handle for the spawned process', () => {
    const handle = new FfmpegProcessRunner().spawn(['-i', 'input.mkv']);

    expect(handle.getPid()).toBe(4242);
    expect(handle.getArgs()).toEqual(spawnedArgs());
  });
});
