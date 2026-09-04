import { singleton } from 'tsyringe';
import FfmpegArgsUtil from '../process/FfmpegArgsUtil.js';
import type { FfmpegFailureKind } from './FfmpegFailureClassifier.js';

export type FfmpegAttemptVerdict =
  | 'ok'
  /**
   * Succeeded, but not with the acceleration it was supposed to use: FFmpeg ran to completion and the output is
   * complete and correct, yet the hardware decoder gave up at some point (e.g. on a profile it does not support) and
   * FFmpeg silently continued decoding in software.
   */
  | 'degraded'
  | 'failed'
  /** The job got what it needed, and the process died later on */
  | 'ready-then-failed'
  /** The job got what it needed, and its owner ended the process on purpose (a seek, a session ending) */
  | 'stopped';

export type FfmpegAttemptRecord = {
  readonly job: string;
  readonly accel: string;
  readonly verdict: FfmpegAttemptVerdict;
  readonly failureKind: FfmpegFailureKind | null;
  readonly runtimeInMillis: number;
  readonly frames: number | null;
  readonly peakFps: number | null;
  readonly speed: number | null;
  readonly recordedAt: Date;
  readonly args: readonly string[];
  readonly logProblems: string;
}

/**
 * One record per attempt, so "which device and mode works for which files, and how fast" can be answered later
 * instead of guessed. The only sink so far is the debug log; the record is shaped for a persistent one.
 */
@singleton()
export default class FfmpegJobStats {
  private static readonly FAILED_VERDICTS: readonly FfmpegAttemptVerdict[] = ['failed', 'ready-then-failed'];

  record(record: FfmpegAttemptRecord): void {
    console.debug(`[DEBUG] FFmpeg job '${record.job}' ${record.verdict} using '${record.accel}'${record.failureKind != null ? ` (${record.failureKind})` : ''}: {runtime=${record.runtimeInMillis}ms, frames=${record.frames ?? 'n/a'}, peakFps=${record.peakFps ?? 'n/a'}, speed=${record.speed ?? 'n/a'}${FfmpegJobStats.describeInputOfFailure(record)}}`);
  }

  /** Only failures name their input: a run that worked says nothing a caller could not already tell, and there are thousands of them */
  private static describeInputOfFailure(record: FfmpegAttemptRecord): string {
    if (!FfmpegJobStats.FAILED_VERDICTS.includes(record.verdict)) {
      return '';
    }
    return `, input=${FfmpegArgsUtil.describeInputs(record.args)}`;
  }
}
