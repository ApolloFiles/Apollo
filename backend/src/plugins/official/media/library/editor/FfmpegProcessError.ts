import type { ProcessResult } from '../../../../builtin/child_process/BufferedChildProcess.js';

type ExtraData = {
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
  args: string[],
}

export default class FfmpegProcessError extends Error {
  public readonly exitCode: number | null;
  public readonly signal: NodeJS.Signals | null;
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly args: string[];

  constructor(message?: string, options?: ErrorOptions, extraData?: ExtraData) {
    super(message);

    if (extraData == null) {
      throw new Error('extraData is required');
    }

    this.exitCode = extraData.exitCode;
    this.signal = extraData.signal;
    this.stdout = extraData.stdout;
    this.stderr = extraData.stderr;
    this.args = extraData.args;
  }

  static create(ffmpegProcess: ProcessResult, args: string[]): FfmpegProcessError {
    const extraData: ExtraData = {
      exitCode: ffmpegProcess.exitCode,
      signal: ffmpegProcess.signal,
      stdout: ffmpegProcess.stdout.toString(),
      stderr: ffmpegProcess.stderr.toString(),
      args,
    };

    return new FfmpegProcessError(
      `Editing a video file's metadata failed because ffmpeg exited with code ${ffmpegProcess.exitCode}: ${JSON.stringify(extraData)}`,
      undefined,
      extraData,
    );
  }
}
