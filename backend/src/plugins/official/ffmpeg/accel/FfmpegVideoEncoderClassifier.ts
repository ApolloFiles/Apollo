import { FFMPEG_HARDWARE_ACCELERATIONS, type FfmpegHardwareAcceleration } from './FfmpegHardwareAcceleration.js';

export type FfmpegVideoEncoderKind =
  | { readonly type: 'software' }
  /** `acceleration` is `null` for hardware Apollo cannot decode with, so it can only be recognized, not selected */
  | { readonly type: 'hardware', readonly acceleration: FfmpegHardwareAcceleration | null }
  | { readonly type: 'unknown' };

const ENCODER_SUFFIX_BY_ACCELERATION: Record<FfmpegHardwareAcceleration, string> = {
  cuda: '_nvenc',
  qsv: '_qsv',
  vaapi: '_vaapi',
};

/** Known hardware encoder suffixes, that Apollo does not support (yet) – Extend this when FFmpeg gains another one */
const OTHER_HARDWARE_ENCODER_SUFFIXES = ['_amf', '_vulkan', '_v4l2m2m', '_videotoolbox', '_mediacodec', '_rkmpp', '_omx', '_mf'];

/**
 * The software encoders Apollo picks between, which is only ever what a job offers as `videoEncoderCandidates` –
 * an encoder named directly in a job's arguments (`-c:v png`) never reaches this classifier.
 *
 * Adding another codec means adding it here too, and forgetting is loud rather than silent:
 * the encoder is dropped with a warning wherever hardware acceleration is restricted.
 */
const KNOWN_SOFTWARE_VIDEO_ENCODERS = ['libx264'];

export default class FfmpegVideoEncoderClassifier {
  static classify(encoder: string): FfmpegVideoEncoderKind {
    const acceleration = FfmpegVideoEncoderClassifier.determineAcceleration(encoder);
    if (acceleration != null) {
      return { type: 'hardware', acceleration };
    }
    if (KNOWN_SOFTWARE_VIDEO_ENCODERS.includes(encoder)) {
      return { type: 'software' };
    }
    if (OTHER_HARDWARE_ENCODER_SUFFIXES.some((suffix) => encoder.endsWith(suffix))) {
      return { type: 'hardware', acceleration: null };
    }

    return { type: 'unknown' };
  }

  private static determineAcceleration(encoder: string): FfmpegHardwareAcceleration | null {
    return FFMPEG_HARDWARE_ACCELERATIONS.find((acceleration) => encoder.endsWith(ENCODER_SUFFIX_BY_ACCELERATION[acceleration])) ?? null;
  }
}
