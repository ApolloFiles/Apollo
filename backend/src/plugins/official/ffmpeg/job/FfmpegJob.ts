import type { FfmpegAccelerationProfile, FfmpegAccelerationRequirements } from '../accel/FfmpegAccelerationPlanner.js';
import type FfmpegHandle from '../process/FfmpegHandle.js';
import type { FfmpegSpawnOptions } from '../process/FfmpegProcessRunner.js';

/**
 * One thing to accomplish with FFmpeg, described in a way that lets a job runner attempt it more than once.
 *
 * Only the arguments and what counts as a result are job-specific – picking the acceleration to try, falling back
 * when it does not work and taking broken hardware out of rotation is the runner's job.
 */
export type FfmpegJob<T> = {
  /** Names the job in logs. */
  readonly name: string;

  readonly acceleration: FfmpegAccelerationRequirements;
  readonly spawnOptions?: FfmpegSpawnOptions;

  buildArgs(profile: FfmpegAccelerationProfile): string[] | Promise<string[]>;

  /**
   * Resolves once the job produced what its caller needs; throwing marks this attempt as failed.
   *
   * Called once per attempt with a freshly spawned process, so per-attempt state (a listener on the log output,
   * the frames collected so far) belongs in here rather than in the surrounding scope.
   *
   * A job whose process keeps running past its result – a live transcode that only has to reach the point where it
   * serves its first segment – returns that still-running handle as part of `T` and owns it from then on.
   */
  awaitOutcome(handle: FfmpegHandle, profile: FfmpegAccelerationProfile): Promise<T>;

  /** Removes what a failed attempt left behind, because FFmpeg refuses to overwrite an existing output file. */
  discardOutput?(): Promise<void>;
}
