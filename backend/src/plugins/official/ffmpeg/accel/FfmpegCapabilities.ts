import { singleton } from 'tsyringe';
import FfmpegProcessRunner from '../process/FfmpegProcessRunner.js';

/** Decode accelerations Apollo knows how to use, most favorable first. */
export const FFMPEG_DECODE_ACCELERATIONS = ['cuda', 'qsv', 'vaapi'] as const;
export type FfmpegDecodeAcceleration = (typeof FFMPEG_DECODE_ACCELERATIONS)[number];

/**
 * Determines what the FFmpeg on this machine can actually do, so callers can name an encoder and a decode
 * acceleration explicitly instead of hoping that `-hwaccel auto` picks something that works.
 *
 * Probing is cheap but not free, so every answer is cached for the lifetime of the process. The probes only prove
 * that an encoder can be instantiated and that a hardware device can be created – a decoder that fails on a
 * specific input file still needs a fallback at the call site, which is what the `mark…Unusable` methods are for.
 */
@singleton()
export default class FfmpegCapabilities {
  private static readonly PROBE_TIMEOUT_IN_MILLIS = 15_000;

  private readonly videoEncoderProbes = new Map<string, Promise<boolean>>();
  private readonly unusableVideoEncoders = new Set<string>();
  private readonly unusableDecodeAccelerations = new Set<FfmpegDecodeAcceleration>();
  private decodeAccelerationProbe: Promise<FfmpegDecodeAcceleration[]> | null = null;

  constructor(
    private readonly ffmpegProcessRunner: FfmpegProcessRunner,
  ) {
  }

  /** Returns the given encoders that are usable on this machine, keeping the order they were passed in. */
  async filterUsableVideoEncoders(candidates: readonly string[]): Promise<string[]> {
    const usableEncoders: string[] = [];
    for (const candidate of candidates) {
      if (await this.isVideoEncoderUsable(candidate)) {
        usableEncoders.push(candidate);
      }
    }
    return usableEncoders;
  }

  async isVideoEncoderUsable(encoder: string): Promise<boolean> {
    if (this.unusableVideoEncoders.has(encoder)) {
      return false;
    }

    let probe = this.videoEncoderProbes.get(encoder);
    if (probe == null) {
      probe = this.probeVideoEncoder(encoder);
      this.videoEncoderProbes.set(encoder, probe);
    }
    return probe;
  }

  /** The usable decode accelerations, most favorable first. */
  async getUsableDecodeAccelerations(): Promise<FfmpegDecodeAcceleration[]> {
    this.decodeAccelerationProbe ??= this.probeDecodeAccelerations();

    const probedAccelerations = await this.decodeAccelerationProbe;
    return probedAccelerations.filter((acceleration) => !this.unusableDecodeAccelerations.has(acceleration));
  }

  /** Stops offering an encoder that a probe accepted but that turned out to fail on real input. */
  markVideoEncoderUnusable(encoder: string, reason: string): void {
    if (this.unusableVideoEncoders.has(encoder)) {
      return;
    }

    console.warn(`Not using the FFmpeg video encoder '${encoder}' anymore: ${reason}`);
    this.unusableVideoEncoders.add(encoder);
  }

  /** Stops offering a decode acceleration that a probe accepted but that turned out to fail on real input. */
  markDecodeAccelerationUnusable(acceleration: FfmpegDecodeAcceleration, reason: string): void {
    if (this.unusableDecodeAccelerations.has(acceleration)) {
      return;
    }

    console.warn(`Not using the FFmpeg decode acceleration '${acceleration}' anymore: ${reason}`);
    this.unusableDecodeAccelerations.add(acceleration);
  }

  private async probeVideoEncoder(encoder: string): Promise<boolean> {
    const handle = this.ffmpegProcessRunner.spawn([
      '-f', 'lavfi',
      '-i', 'color=c=black:s=320x240:r=25',
      '-frames:v', '1',
      '-c:v', encoder,
      '-f', 'null', '-',
    ], {
      logVerbosity: 'error',
      timeoutInMillis: FfmpegCapabilities.PROBE_TIMEOUT_IN_MILLIS,
    });

    const exitResult = await handle.waitForExit();
    if (exitResult.exitCode === 0) {
      return true;
    }

    console.debug(`[DEBUG] FFmpeg video encoder '${encoder}' is not usable on this machine (exitCode=${exitResult.exitCode}, signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
    return false;
  }

  private async probeDecodeAccelerations(): Promise<FfmpegDecodeAcceleration[]> {
    const compiledInAccelerations = await this.listCompiledInAccelerations();

    const usableAccelerations: FfmpegDecodeAcceleration[] = [];
    for (const acceleration of FFMPEG_DECODE_ACCELERATIONS) {
      if (!compiledInAccelerations.has(acceleration)) {
        continue;
      }
      if (await this.probeHardwareDeviceCreation(acceleration)) {
        usableAccelerations.push(acceleration);
      }
    }

    console.debug(`[DEBUG] Usable FFmpeg decode accelerations: ${usableAccelerations.join(', ') || '<none>'}`);
    return usableAccelerations;
  }

  private async probeHardwareDeviceCreation(acceleration: FfmpegDecodeAcceleration): Promise<boolean> {
    const handle = this.ffmpegProcessRunner.spawn([
      '-init_hw_device', acceleration,
      '-f', 'lavfi',
      '-i', 'nullsrc',
      '-frames:v', '1',
      '-f', 'null', '-',
    ], {
      logVerbosity: 'error',
      timeoutInMillis: FfmpegCapabilities.PROBE_TIMEOUT_IN_MILLIS,
    });

    const exitResult = await handle.waitForExit();
    if (exitResult.exitCode === 0) {
      return true;
    }

    console.debug(`[DEBUG] FFmpeg cannot create a '${acceleration}' hardware device on this machine (exitCode=${exitResult.exitCode}, signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
    return false;
  }

  private async listCompiledInAccelerations(): Promise<Set<string>> {
    const handle = this.ffmpegProcessRunner.spawn(['-hwaccels'], {
      logVerbosity: 'error',
      captureStdout: true,
      timeoutInMillis: FfmpegCapabilities.PROBE_TIMEOUT_IN_MILLIS,
    });

    const exitResult = await handle.waitForExit();
    if (exitResult.exitCode !== 0) {
      throw new Error(`Failed to list the hardware accelerations FFmpeg was built with (exitCode=${exitResult.exitCode}, signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
    }

    const accelerations = handle.getStdout()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.endsWith(':'));
    return new Set(accelerations);
  }
}
