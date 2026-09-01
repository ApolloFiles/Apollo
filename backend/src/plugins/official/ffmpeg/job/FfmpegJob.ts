import type { Accel } from '../accel/Accel.js';
import type { FfmpegHardwareApi } from '../accel/FfmpegHardwareApi.js';
import type { HwVideoCodec } from '../accel/HwContext.js';
import type FfmpegHandle from '../process/FfmpegHandle.js';
import type { FfmpegSpawnOptions } from '../process/FfmpegProcessRunner.js';

export type FfmpegVideoInput = {
  readonly path: string;
  readonly codecName: string;
  /** As ffprobe reports it (`yuv420p`, `yuv420p10le`, …); `null` when unknown */
  readonly pixelFormat: string | null;
  readonly width: number;
  readonly height: number;
}

export type FfmpegAccelerationRequirement = {
  /** The job's input */
  readonly input: FfmpegVideoInput;

  /**
   * Whether the job's filters can run on the device until only a small tail (`tile`, `thumbnail`, an image encoder)
   * is left for the CPU. Hardware decoding with everything else in software measured slower than plain software, so a
   * job that cannot keep its frames on the device only gets hardware for encoding.
   */
  readonly gpuFilters: boolean;

  readonly videoEncoder: HwVideoCodec | null;

  /** APIs this job must not run on – e.g. `qsv` for keyframe-only sampling, whose decoders ignore `-skip_frame` */
  readonly excludedApis?: readonly FfmpegHardwareApi[];

  /** {@link HwContext#id}s that already failed this job's caller, e.g. mid-stream in the same player session */
  readonly excludedAccelIds?: readonly string[];
}

/** One thing to accomplish with FFmpeg, described in a way that lets a job runner attempt it more than once */
export type FfmpegJob<T> = {
  /** Names the job in logs and stats */
  readonly name: string;

  /** `null` for jobs that hardware cannot help (remuxing, subtitle extraction): one software attempt, no probing */
  readonly acceleration: FfmpegAccelerationRequirement | null;

  readonly spawnOptions?: FfmpegSpawnOptions;

  buildArgs(accel: Accel): string[] | Promise<string[]>;

  /**
   * Resolves once the job produced what its caller needs; throwing marks this attempt as failed.
   *
   * Called once per attempt with a freshly spawned process, so per-attempt state (a listener on the log output,
   * the frames collected so far) belongs in here rather than in the surrounding scope.
   *
   * A job whose process keeps running past its result – a live transcode that only has to reach the point where it
   * serves its first segment – returns that still-running handle as part of `T` and owns it from then on. The runner
   * still classifies and records how it eventually ends.
   *
   * @throws UnretryableFfmpegJobError
   */
  awaitOutcome(handle: FfmpegHandle, accel: Accel): Promise<T>;

  /** Removes what a failed attempt left behind, because FFmpeg might refuse to overwrite an existing output file */
  discardOutput?(): Promise<void>;
}
