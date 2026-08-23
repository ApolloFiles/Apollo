import { singleton } from 'tsyringe';
import AppConfiguration from '../../../../config/AppConfiguration.js';
import { FFMPEG_HARDWARE_ACCELERATIONS, type FfmpegHardwareAcceleration } from './FfmpegHardwareAcceleration.js';
import FfmpegVideoEncoderClassifier, { type FfmpegVideoEncoderKind } from './FfmpegVideoEncoderClassifier.js';

/** Everything but `all` and `none` names the single technology to allow. */
type AllowedAcceleration = 'all' | 'none' | FfmpegHardwareAcceleration;

/**
 * What the app configuration allows: `auto` for anything, `off` for nothing, or the name of the single technology to use.
 *
 * Pinning one is what a machine with more than one GPU needs, where probing settles on a device that turns out not
 * to work. Since a technology covers decoding and encoding alike, pinning `cuda` also restricts the encoders to the
 * `*_nvenc` ones.
 */
@singleton()
export default class FfmpegHardwareAccelerationConfig {
  private readonly encodersWarnedAbout = new Set<string>();
  private allowedAcceleration: AllowedAcceleration | null = null;

  constructor(
    private readonly appConfiguration: AppConfiguration,
  ) {
  }

  /** The accelerations worth probing at all, most favorable first. */
  getAllowedAccelerations(): readonly FfmpegHardwareAcceleration[] {
    const allowedAcceleration = this.getAllowedAcceleration();
    if (allowedAcceleration === 'none') {
      return [];
    }
    if (allowedAcceleration === 'all') {
      return FFMPEG_HARDWARE_ACCELERATIONS;
    }
    return [allowedAcceleration];
  }

  isVideoEncoderAllowed(encoder: string): boolean {
    const encoderKind = this.classifyVideoEncoder(encoder);

    const allowedAcceleration = this.getAllowedAcceleration();
    if (allowedAcceleration === 'all' || encoderKind.type === 'software') {
      return true;
    }
    return encoderKind.type === 'hardware' && encoderKind.acceleration === allowedAcceleration;
  }

  private getAllowedAcceleration(): AllowedAcceleration {
    this.allowedAcceleration ??= this.determineAllowedAcceleration();
    return this.allowedAcceleration;
  }

  private determineAllowedAcceleration(): AllowedAcceleration {
    const configuredValue = this.appConfiguration.config.ffmpeg.hardwareAcceleration.trim().toLowerCase();
    if (configuredValue === 'off') {
      console.info('Hardware acceleration is turned off by APOLLO_FFMPEG_HARDWARE_ACCELERATION');
      return 'none';
    }
    if (configuredValue === 'auto') {
      return 'all';
    }

    const pinnedAcceleration = FFMPEG_HARDWARE_ACCELERATIONS.find((acceleration) => acceleration === configuredValue);
    if (pinnedAcceleration == null) {
      console.warn(`Ignoring APOLLO_FFMPEG_HARDWARE_ACCELERATION='${configuredValue}' – expected 'auto', 'off' or one of ${FFMPEG_HARDWARE_ACCELERATIONS.join(', ')}`);
      return 'all';
    }

    console.info(`Hardware acceleration is pinned to '${pinnedAcceleration}' by APOLLO_FFMPEG_HARDWARE_ACCELERATION`);
    return pinnedAcceleration;
  }

  /**
   * Complains about every encoder it cannot place, no matter what the setting is.
   *
   * Almost everyone runs on `auto`, where the classification does not change a thing – so only ever complaining
   * where it does would leave the gap for someone else's deployment to run into and report.
   */
  private classifyVideoEncoder(encoder: string): FfmpegVideoEncoderKind {
    const encoderKind = FfmpegVideoEncoderClassifier.classify(encoder);
    if (encoderKind.type !== 'unknown' || this.encodersWarnedAbout.has(encoder)) {
      return encoderKind;
    }

    this.encodersWarnedAbout.add(encoder);
    console.warn(`Cannot tell what the video encoder '${encoder}' runs on – add it to FfmpegVideoEncoderClassifier, or it is dropped wherever APOLLO_FFMPEG_HARDWARE_ACCELERATION restricts hardware acceleration`);
    return encoderKind;
  }
}
