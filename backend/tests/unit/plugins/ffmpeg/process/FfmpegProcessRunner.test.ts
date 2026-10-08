import ChildProcess from 'node:child_process';
import Os from 'node:os';
import FfmpegProcessRunner from '#src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import FakeChildProcess from './FakeChildProcess.js';

vi.mock('node:child_process', () => ({
  default: { spawn: vi.fn() },
}));

describe(FfmpegProcessRunner, () => {
  const spawnMock = vi.mocked(ChildProcess.spawn);
  let runner: FfmpegProcessRunner;

  beforeEach(() => {
    spawnMock.mockImplementation(() => new FakeChildProcess().asChildProcess());
    runner = new FfmpegProcessRunner();
  });

  function spawnedArgs(): string[] {
    return spawnMock.mock.calls[0][1] as string[];
  }

  function spawnedArgAfter(flag: string): string | undefined {
    const args = spawnedArgs();
    return args[args.indexOf(flag) + 1];
  }

  function spawnedOptions(): ChildProcess.SpawnOptions {
    return spawnMock.mock.calls[0][2] as ChildProcess.SpawnOptions;
  }

  test('Runs the ffmpeg executable', () => {
    runner.spawn([]);

    expect(spawnMock).toHaveBeenCalledExactlyOnceWith('ffmpeg', expect.any(Array), expect.any(Object));
  });

  test("Appends the caller's arguments to the base arguments", () => {
    runner.spawn(['-i', 'input.mkv', 'output.mkv']);

    expect(spawnedArgs().slice(-3)).toEqual(['-i', 'input.mkv', 'output.mkv']);
  });

  test('Requests progress on a dedicated file descriptor', () => {
    runner.spawn([]);

    expect(spawnedArgAfter('-progress')).toBe('pipe:3');
    expect(spawnedOptions().stdio).toEqual(['ignore', 'ignore', 'pipe', 'pipe']);
  });

  test('Disables the stats output that would otherwise share stderr with the log', () => {
    runner.spawn([]);

    expect(spawnedArgs()).toContain('-nostats');
  });

  test('Keeps ffmpeg from touching stdin and from printing its banner', () => {
    runner.spawn([]);

    expect(spawnedArgs()).toContain('-nostdin');
    expect(spawnedArgs()).toContain('-hide_banner');
  });

  test('Logs at info level with the level prefix by default', () => {
    runner.spawn([]);

    expect(spawnedArgAfter('-loglevel')).toBe('level+info');
  });

  test('Keeps the level prefix when the caller raises the verbosity', () => {
    runner.spawn([], { logVerbosity: 'debug' });

    expect(spawnedArgAfter('-loglevel')).toBe('level+debug');
  });

  test('Reports progress once a second by default', () => {
    runner.spawn([]);

    expect(spawnedArgAfter('-stats_period')).toBe('1');
  });

  test('Honors a custom progress period', () => {
    runner.spawn([], { progressPeriodInSeconds: 0.5 });

    expect(spawnedArgAfter('-stats_period')).toBe('0.5');
  });

  test('Pipes stdout when it is supposed to be captured', () => {
    runner.spawn([], { captureStdout: true });

    expect(spawnedOptions().stdio).toEqual(['ignore', 'pipe', 'pipe', 'pipe']);
  });

  test("Falls back to the system's temporary directory when no working directory is given", () => {
    vi.spyOn(Os, 'tmpdir').mockReturnValue('/tmp/apollo-test');

    runner.spawn([]);

    expect(spawnedOptions().cwd).toBe('/tmp/apollo-test');
  });

  test('Honors the given working directory', () => {
    runner.spawn([], { cwd: '/some/work/dir' });

    expect(spawnedOptions().cwd).toBe('/some/work/dir');
  });

  test('Force-kills a process that exceeds its timeout', () => {
    runner.spawn([], { timeoutInMillis: 15_000 });

    expect(spawnedOptions()).toMatchObject({ timeout: 15_000, killSignal: 'SIGKILL' });
  });

  test('Does not impose a timeout by default', () => {
    runner.spawn([]);

    expect(spawnedOptions().timeout).toBeUndefined();
  });

  test('Returns a handle for the spawned process', () => {
    const handle = runner.spawn(['-i', 'input.mkv']);

    expect(handle.getPid()).toBe(4242);
    expect(handle.getArgs()).toEqual([
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-loglevel', 'level+info',
      '-stats_period', '1',
      '-progress', 'pipe:3',
      '-i', 'input.mkv',
    ]);
  });
});
