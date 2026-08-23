import { singleton } from 'tsyringe';
import FfmpegProcessRunner from '../process/FfmpegProcessRunner.js';
import type { FfmpegHardwareAcceleration } from './FfmpegHardwareAcceleration.js';
import FfmpegHardwareAccelerationConfig from './FfmpegHardwareAccelerationConfig.js';

/**
 * Determines what the FFmpeg on this machine can actually do, so callers can name an encoder and a decode
 * acceleration explicitly instead of hoping that `-hwaccel auto` picks something that works.
 *
 * Probing is cheap but not free, so every answer is cached for the lifetime of the process and nothing the
 * configuration rules out is probed at all. The probes only prove that an encoder can be instantiated and that a
 * hardware device can be created – hardware that fails on a specific input file is the job runner's problem, which
 * retries without it.
 */
@singleton()
export default class FfmpegCapabilities {
  private static readonly PROBE_TIMEOUT_IN_MILLIS = 15_000;

  private readonly videoEncoderProbes = new Map<string, Promise<boolean>>();
  private decodeAccelerationProbe: Promise<FfmpegHardwareAcceleration[]> | null = null;

  constructor(
    private readonly ffmpegProcessRunner: FfmpegProcessRunner,
    private readonly ffmpegHardwareAccelerationConfig: FfmpegHardwareAccelerationConfig,
  ) {
  }

  /** Returns the given encoders that are usable on this machine, keeping the order they were passed in. */
  async filterUsableVideoEncoders(candidates: readonly string[]): Promise<string[]> {
    const usableEncoders: string[] = [];
    for (const candidate of candidates) {
      if (!this.ffmpegHardwareAccelerationConfig.isVideoEncoderAllowed(candidate)) {
        continue;
      }
      if (await this.isVideoEncoderUsable(candidate)) {
        usableEncoders.push(candidate);
      }
    }
    return usableEncoders;
  }

  async isVideoEncoderUsable(encoder: string): Promise<boolean> {
    let probe = this.videoEncoderProbes.get(encoder);
    if (probe == null) {
      probe = this.probeVideoEncoder(encoder);
      this.videoEncoderProbes.set(encoder, probe);
      this.forgetOnFailure(probe, () => this.videoEncoderProbes.delete(encoder));
    }
    return probe;
  }

  /** The usable decode accelerations, most favorable first. */
  async getUsableDecodeAccelerations(): Promise<FfmpegHardwareAcceleration[]> {
    if (this.decodeAccelerationProbe == null) {
      this.decodeAccelerationProbe = this.probeDecodeAccelerations();
      this.forgetOnFailure(this.decodeAccelerationProbe, () => this.decodeAccelerationProbe = null);
    }
    return [...await this.decodeAccelerationProbe];
  }

  /**
   * A probe only answers its question by running to an exit code. One that could not run at all – no process to be
   * had, FFmpeg not answering what it was built with – says nothing about the hardware, so remembering it would
   * leave every later job failing over something that may well have been momentary.
   */
  private forgetOnFailure(probe: Promise<unknown>, forget: () => void): void {
    probe.catch(() => forget());
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

  private async probeDecodeAccelerations(): Promise<FfmpegHardwareAcceleration[]> {
    const allowedAccelerations = this.ffmpegHardwareAccelerationConfig.getAllowedAccelerations();
    if (allowedAccelerations.length === 0) {
      return [];
    }

    const compiledInAccelerations = await this.listCompiledInAccelerations();

    const usableAccelerations: FfmpegHardwareAcceleration[] = [];
    for (const acceleration of allowedAccelerations) {
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

  private async probeHardwareDeviceCreation(acceleration: FfmpegHardwareAcceleration): Promise<boolean> {
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
