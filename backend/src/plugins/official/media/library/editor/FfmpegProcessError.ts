import type FfmpegHandle from '../../../ffmpeg/process/FfmpegHandle.js';
import type { FfmpegExitResult } from '../../../ffmpeg/process/FfmpegHandle.js';

type ExtraData = {
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  log: string,
  args: readonly string[],
}

export default class FfmpegProcessError extends Error {
  public readonly exitCode: number | null;
  public readonly signal: NodeJS.Signals | null;
  public readonly log: string;
  public readonly args: readonly string[];

  constructor(message?: string, options?: ErrorOptions, extraData?: ExtraData) {
    super(message);

    if (extraData == null) {
      throw new Error('extraData is required');
    }

    this.exitCode = extraData.exitCode;
    this.signal = extraData.signal;
    this.log = extraData.log;
    this.args = extraData.args;
  }

  static create(handle: FfmpegHandle, exitResult: FfmpegExitResult): FfmpegProcessError {
    const extraData: ExtraData = {
      exitCode: exitResult.exitCode,
      signal: exitResult.signal,
      log: handle.getLogProblems(),
      args: handle.getArgs(),
    };

    return new FfmpegProcessError(
      `Editing a video file's metadata failed because ffmpeg exited with code ${exitResult.exitCode}: ${JSON.stringify(extraData)}`,
      undefined,
      extraData,
    );
  }
}
