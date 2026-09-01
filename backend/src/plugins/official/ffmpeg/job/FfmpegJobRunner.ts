import { singleton } from 'tsyringe';
import type { Accel } from '../accel/Accel.js';
import FfmpegCapabilityCache from '../accel/FfmpegCapabilityCache.js';
import HwContext from '../accel/HwContext.js';
import type { default as FfmpegHandle, FfmpegExitResult } from '../process/FfmpegHandle.js';
import FfmpegProcessRunner from '../process/FfmpegProcessRunner.js';
import FfmpegCandidatePlanner from './FfmpegCandidatePlanner.js';
import FfmpegFailureClassifier, { type FfmpegFailure } from './FfmpegFailureClassifier.js';
import type { FfmpegJob } from './FfmpegJob.js';
import FfmpegJobStats, { type FfmpegAttemptVerdict } from './FfmpegJobStats.js';

type AttemptResult<T> =
  {
    readonly outcome: T,
  } | {
    readonly failure: FfmpegFailure,
    readonly cause: unknown,
  };

class FfmpegExitedEarlyError extends Error {
  constructor(exitResult: FfmpegExitResult) {
    super(`FFmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}) before the job got what it needed`);
  }
}

/**
 * Runs a job, degrading through the ways it can run until one of them works.
 *
 * A probe only proves one frame decodes and one frame encodes; the file may still change profile halfway or trip a
 * filter the probe never exercised. So every attempt is watched, classified when it fails, and the next candidate
 * is tried – unless the failure is one that no device is going to fix.
 */
@singleton()
export default class FfmpegJobRunner {
  constructor(
    private readonly ffmpegProcessRunner: FfmpegProcessRunner,
    private readonly candidatePlanner: FfmpegCandidatePlanner,
    private readonly capabilityCache: FfmpegCapabilityCache,
    private readonly stats: FfmpegJobStats,
  ) {
  }

  async run<T>(job: FfmpegJob<T>): Promise<T> {
    const candidates = await this.candidatePlanner.plan(job.acceleration);

    for (let index = 0; index < candidates.length; ++index) {
      const accel = candidates[index];
      if (index > 0) {
        await FfmpegJobRunner.discardOutputQuietly(job);
      }

      const attemptResult = await this.attempt(job, accel);
      if (!('failure' in attemptResult)) {
        return attemptResult.outcome;
      }

      const nextAccel = candidates[index + 1];
      if (nextAccel == null || !attemptResult.failure.retryable) {
        await FfmpegJobRunner.discardOutputQuietly(job);
        throw attemptResult.cause;
      }
      console.warn(`FFmpeg job '${job.name}' failed using '${accel.id}' [${attemptResult.failure.message}], retrying with '${nextAccel.id}'`);
    }

    throw new Error(`FFmpeg job '${job.name}' had nothing to run with`);
  }

  private async attempt<T>(job: FfmpegJob<T>, accel: Accel): Promise<AttemptResult<T>> {
    const args = await this.buildArgs(job, accel);

    // Nothing may be awaited between spawning and attaching the observers: FFmpeg starts writing right away and a
    // listener attached one microtask later would miss the beginning of its output
    const handle = this.ffmpegProcessRunner.spawn(args, job.spawnOptions);
    const classifier = FfmpegFailureClassifier.observe(handle);
    const outcomePromise = job.awaitOutcome(handle, accel);
    outcomePromise.catch(() => undefined);

    try {
      const outcome = await Promise.race([outcomePromise, FfmpegJobRunner.rejectOnFailedExit(handle)]);
      this.recordSettledOrEventualExit(job, accel, handle, classifier);
      return { outcome };
    } catch (cause) {
      await handle.kill().catch(() => undefined);
      const failure = classifier.classify(handle.getExitResult(), cause);
      this.record(job, accel, handle, 'failed', failure);
      this.forgetDeviceOnDeviceFailure(accel, failure);
      return { failure, cause };
    }
  }
  private static async discardOutputQuietly<T>(job: FfmpegJob<T>): Promise<void> {
    try {
      await job.discardOutput?.();
    } catch (cause) {
      console.warn(`FFmpeg job '${job.name}' could not discard the output of its failed attempt`, cause);
    }
  }

  /**
   * A job that cannot even say what to run is broken, not unlucky with its hardware: no other candidate is tried,
   * but the attempt is on record so the failure does not vanish between the stats of the ones that ran.
   */
  private async buildArgs<T>(job: FfmpegJob<T>, accel: Accel): Promise<string[]> {
    try {
      return await job.buildArgs(accel);
    } catch (cause) {
      this.stats.record({
        job: job.name,
        accel: accel.id,
        verdict: 'failed',
        failureKind: 'aborted',
        runtimeInMillis: 0,
        frames: null,
        peakFps: null,
        speed: null,
        recordedAt: new Date(),
        args: [],
        logProblems: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }

  /** A non-zero exit fails the attempt right away, so a live job does not sit out its startup timeout on a dead process */
  private static async rejectOnFailedExit(handle: FfmpegHandle): Promise<never> {
    const exitResult = await handle.waitForExit();
    if (exitResult.exitCode !== 0) {
      throw new FfmpegExitedEarlyError(exitResult);
    }
    return new Promise<never>(() => undefined);
  }

  /**
   * A job that resolved while its process keeps running owns the handle now, but how the process ends is still
   * worth knowing – a live transcode dying halfway through is exactly the failure a probe cannot predict.
   */
  private recordSettledOrEventualExit<T>(job: FfmpegJob<T>, accel: Accel, handle: FfmpegHandle, classifier: FfmpegFailureClassifier): void {
    const recordSuccess = (): void => {
      const verdict: FfmpegAttemptVerdict = accel instanceof HwContext && classifier.silentlyFellBackToSoftware ? 'degraded' : 'ok';
      this.record(job, accel, handle, verdict, null);
    };

    if (handle.hasExited()) {
      recordSuccess();
      return;
    }

    handle.once('exit', (exitResult) => {
      if (handle.crashed()) {
        this.record(job, accel, handle, 'ready-then-failed', classifier.classify(exitResult, new FfmpegExitedEarlyError(exitResult)));
      } else if (exitResult.exitCode === 0) {
        recordSuccess();
      } else {
        this.record(job, accel, handle, 'stopped', null);
      }
    });
  }

  /** The probes said yes and yes never expires, so a device that broke since has to be asked again */
  private forgetDeviceOnDeviceFailure(accel: Accel, failure: FfmpegFailure): void {
    if (accel instanceof HwContext && failure.kind === 'device') {
      console.warn(`The FFmpeg device '${accel.device.id}' failed although it probed fine – probing it again before the next job: ${failure.message}`);
      this.capabilityCache.forgetDevice(accel.device);
    }
  }

  private record<T>(job: FfmpegJob<T>, accel: Accel, handle: FfmpegHandle, verdict: FfmpegAttemptVerdict, failure: FfmpegFailure | null): void {
    const runStats = handle.getStats();
    this.stats.record({
      job: job.name,
      accel: accel.id,
      verdict,
      failureKind: failure?.kind ?? null,
      runtimeInMillis: runStats.runtimeInMillis,
      frames: runStats.lastProgress?.frame ?? null,
      peakFps: runStats.peakFps,
      speed: runStats.lastProgress?.speed ?? null,
      recordedAt: new Date(),
      args: handle.getArgs(),
      logProblems: handle.getLogProblems(),
    });
  }
}
