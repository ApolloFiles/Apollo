import { singleton } from 'tsyringe';
import FfmpegCapabilities from './FfmpegCapabilities.js';
import type { FfmpegHardwareAcceleration } from './FfmpegHardwareAcceleration.js';

export type FfmpegAccelerationProfile = {
  /** Identifies the profile in logs, e.g. `cuda+h264_nvenc` or `software`. */
  readonly id: string;
  readonly decodeAcceleration: FfmpegHardwareAcceleration | null;
  readonly videoEncoder: string | null;
}

export type FfmpegAccelerationRequirements = {
  readonly mayUseHardwareDecoding: boolean;

  /**
   * Video encoders the job can use, most favorable first – omit it if the job does not encode video.
   *
   * The last entry decides what happens once hardware is unavailable: name a software encoder to let the job
   * degrade to it, or leave it out to make the job fail instead.
   */
  readonly videoEncoderCandidates?: readonly string[];
}

/**
 * Turns what a job can use into the ordered list of attempts a job runner should make.
 *
 * Every usable decode acceleration gets a turn before software does, because probing only proves that a device can
 * be created – not that it can decode this particular file. An ageing dedicated GPU that cannot do AV1 still hands
 * the file to the iGPU next to it instead of dropping the whole machine to decoding in software.
 *
 * Hardware decoding is given up before the encoder is: decoding is the half that fails per file, while an encoder
 * either works on a machine or does not, which the probe already settled.
 */
@singleton()
export default class FfmpegAccelerationPlanner {
  constructor(
    private readonly ffmpegCapabilities: FfmpegCapabilities,
  ) {
  }

  async plan(requirements: FfmpegAccelerationRequirements): Promise<FfmpegAccelerationProfile[]> {
    const videoEncoders = await this.determineVideoEncoders(requirements);
    const decodeAccelerations = await this.determineDecodeAccelerations(requirements);

    const profiles: FfmpegAccelerationProfile[] = [];
    for (const decodeAcceleration of decodeAccelerations) {
      profiles.push(FfmpegAccelerationPlanner.createProfile(decodeAcceleration, videoEncoders[0]));
    }
    for (const videoEncoder of videoEncoders) {
      profiles.push(FfmpegAccelerationPlanner.createProfile(null, videoEncoder));
    }

    return profiles;
  }

  private async determineVideoEncoders(requirements: FfmpegAccelerationRequirements): Promise<(string | null)[]> {
    if (requirements.videoEncoderCandidates == null) {
      return [null];
    }

    const usableEncoders = await this.ffmpegCapabilities.filterUsableVideoEncoders(requirements.videoEncoderCandidates);
    if (usableEncoders.length === 0) {
      throw new Error(`None of the video encoders (${requirements.videoEncoderCandidates.join(', ')}) can be used on this machine`);
    }
    return usableEncoders;
  }

  private async determineDecodeAccelerations(requirements: FfmpegAccelerationRequirements): Promise<FfmpegHardwareAcceleration[]> {
    if (!requirements.mayUseHardwareDecoding) {
      return [];
    }
    return this.ffmpegCapabilities.getUsableDecodeAccelerations();
  }

  private static createProfile(decodeAcceleration: FfmpegHardwareAcceleration | null, videoEncoder: string | null): FfmpegAccelerationProfile {
    const idParts = [decodeAcceleration, videoEncoder].filter((idPart) => idPart != null);
    return {
      id: idParts.join('+') || 'software',
      decodeAcceleration,
      videoEncoder,
    };
  }
}
