import { singleton } from 'tsyringe';
import FfmpegAccelerationPlanner, { type FfmpegAccelerationProfile } from '../accel/FfmpegAccelerationPlanner.js';
import type FfmpegHandle from '../process/FfmpegHandle.js';
import FfmpegProcessRunner from '../process/FfmpegProcessRunner.js';
import type { FfmpegJob } from './FfmpegJob.js';
import UnretryableFfmpegJobError from './UnretryableFfmpegJobError.js';

type AttemptResult<T> = {
  readonly outcome: T;
} | {
  readonly failure: unknown;
  readonly worthRetrying: boolean;
}

/**
 * Runs a job, degrading through the acceleration profiles it can use until one of them works.
 *
 * This exists because {@link FfmpegCapabilities} can only prove that a hardware device can be created, not that
 * decoding a particular file on it works – so the answer to "can we use this" is only ever known by trying.
 */
@singleton()
export default class FfmpegJobRunner {
  /** Failures FFmpeg cannot be talked out of by taking hardware away, so retrying only wastes another process. */
  private static readonly UNRETRYABLE_LOG_MESSAGES = [
    'No such file or directory',
    'already exists. Exiting.',
  ];

  constructor(
    private readonly ffmpegProcessRunner: FfmpegProcessRunner,
    private readonly ffmpegAccelerationPlanner: FfmpegAccelerationPlanner,
  ) {
  }

  async run<T>(job: FfmpegJob<T>): Promise<T> {
    const profiles = await this.ffmpegAccelerationPlanner.plan(job.acceleration);

    for (let profileIndex = 0; profileIndex < profiles.length; ++profileIndex) {
      const profile = profiles[profileIndex];
      if (profileIndex > 0) {
        await job.discardOutput?.();
      }

      const attemptResult = await this.attempt(job, profile);
      if (!('failure' in attemptResult)) {
        return attemptResult.outcome;
      }

      const nextProfile = profiles[profileIndex + 1];
      if (nextProfile == null || !attemptResult.worthRetrying) {
        throw attemptResult.failure;
      }

      console.warn(`FFmpeg job '${job.name}' failed using '${profile.id}', retrying with '${nextProfile.id}'`, attemptResult.failure);
    }

    throw new Error(`FFmpeg job '${job.name}' had no acceleration profile to run with`);
  }

  private async attempt<T>(job: FfmpegJob<T>, profile: FfmpegAccelerationProfile): Promise<AttemptResult<T>> {
    const args = await job.buildArgs(profile);

    // Nothing may be awaited between spawning and handing the handle over: FFmpeg starts writing right away and a
    // listener attached one microtask later would miss the beginning of its output
    const handle = this.ffmpegProcessRunner.spawn(args, job.spawnOptions);
    const outcomePromise = job.awaitOutcome(handle, profile);

    try {
      const outcome = await outcomePromise;
      this.logSucceededAttempt(job, profile, handle);
      return { outcome };
    } catch (failure) {
      // The job gave up, but its process might still be running – and nobody else holds this handle
      await handle.kill().catch(() => undefined);
      return { failure, worthRetrying: FfmpegJobRunner.looksWorthRetrying(handle, failure) };
    }
  }

  private logSucceededAttempt<T>(job: FfmpegJob<T>, profile: FfmpegAccelerationProfile, handle: FfmpegHandle): void {
    const stats = handle.getStats();
    console.debug(`[DEBUG] FFmpeg job '${job.name}' succeeded using '${profile.id}': {runtime=${stats.runtimeInMillis}ms, peakFps=${stats.peakFps ?? 'n/a'}, speed=${stats.lastProgress?.speed ?? 'n/a'}}`);
  }

  /**
   * Only what FFmpeg itself gave up on counts, because `No such file or directory` is a plain errno it prints for
   * any file it could not open – a warning naming some missing font must not keep the runner from trying without
   * the hardware that actually failed. Anything not recognized is retried, which costs a second process at worst.
   */
  private static looksWorthRetrying(handle: FfmpegHandle, failure: unknown): boolean {
    if (failure instanceof UnretryableFfmpegJobError) {
      return false;
    }

    const fatalLogLines = handle.getLogProblems()
      .split('\n')
      .filter((logLine) => logLine.includes('[fatal]'));

    return !fatalLogLines.some((logLine) => FfmpegJobRunner.UNRETRYABLE_LOG_MESSAGES.some((logMessage) => logLine.includes(logMessage)));
  }
}
