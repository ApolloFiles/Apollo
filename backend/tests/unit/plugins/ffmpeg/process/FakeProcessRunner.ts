import FfmpegHandle from '../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type FfmpegProcessRunner from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import type { FfmpegSpawnOptions } from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import FakeChildProcess from './FakeChildProcess.js';

export type ScriptedAttempt = {
  readonly exitCode: number;
  readonly logLines?: readonly string[];
  readonly progressLines?: readonly string[];
  readonly stdout?: string;
  /** Leaves the process running, as a live transcode would. */
  readonly neverExits?: boolean;
};

/** Plays one {@link ScriptedAttempt} per spawn, in order; spawns beyond the script exit cleanly. */
export default class FakeProcessRunner {
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
    const handle = new FfmpegHandle(childProcess.asChildProcess(), args, { captureFullLog: false, captureStdout: options?.captureStdout === true });

    // Two ticks, so the log lines reach the buffer before the exit resolves whoever is waiting on it
    setImmediate(() => {
      for (const logLine of scriptedAttempt.logLines ?? []) {
        childProcess.stderr.write(`${logLine}\n`);
      }
      for (const progressLine of scriptedAttempt.progressLines ?? []) {
        childProcess.progress.write(`${progressLine}\n`);
      }
      if (scriptedAttempt.stdout != null) {
        childProcess.stdout.write(scriptedAttempt.stdout);
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
