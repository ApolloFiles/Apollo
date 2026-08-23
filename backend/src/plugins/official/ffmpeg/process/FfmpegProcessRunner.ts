import ChildProcess from 'node:child_process';
import Os from 'node:os';
import { singleton } from 'tsyringe';
import FfmpegHandle from './FfmpegHandle.js';

export type FfmpegLogVerbosity = 'error' | 'warning' | 'info' | 'verbose' | 'debug';

export type FfmpegSpawnOptions = {
  readonly cwd?: string;

  /** Defaults to `info`. Raise it when a consumer needs to parse FFmpeg's internals (e.g. filter graph output). */
  readonly logVerbosity?: FfmpegLogVerbosity;

  /** Keeps every log line in memory instead of only the recent ones. Off by default. */
  readonly captureFullLog?: boolean;

  /** Buffers stdout so it can be read via {@link FfmpegHandle#getStdout}. Off by default; stdout is discarded then. */
  readonly captureStdout?: boolean;

  /** How often FFmpeg reports its progress. Defaults to one second. */
  readonly progressPeriodInSeconds?: number;

  readonly timeoutInMillis?: number;
}

/**
 * Spawns FFmpeg processes with a consistent set of base arguments.
 *
 * Progress is requested on a dedicated file descriptor instead of relying on the `-stats` output: those lines share
 * stderr with the log output and are separated by carriage returns, which makes them impossible to tell apart from
 * the surrounding log reliably.
 */
@singleton()
export default class FfmpegProcessRunner {
  private static readonly EXECUTABLE = 'ffmpeg';

  spawn(args: readonly string[], options: FfmpegSpawnOptions = {}): FfmpegHandle {
    const effectiveArgs = [...FfmpegProcessRunner.buildBaseArgs(options), ...args];

    const childProcess = ChildProcess.spawn(
      FfmpegProcessRunner.EXECUTABLE,
      effectiveArgs,
      {
        cwd: options.cwd ?? Os.tmpdir(),
        stdio: ['ignore', options.captureStdout === true ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: options.timeoutInMillis,
        killSignal: 'SIGKILL',
      },
    );

    return new FfmpegHandle(childProcess, effectiveArgs, {
      captureFullLog: options.captureFullLog === true,
      captureStdout: options.captureStdout === true,
    });
  }

  private static buildBaseArgs(options: FfmpegSpawnOptions): string[] {
    return [
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-loglevel', `level+${options.logVerbosity ?? 'info'}`,
      '-stats_period', (options.progressPeriodInSeconds ?? 1).toString(),
      '-progress', `pipe:${FfmpegHandle.PROGRESS_FD}`,
    ];
  }
}
