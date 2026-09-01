import type { ExtendedProbeResult } from '../probe/FfprobeExecutor.js';
import type { FfmpegVideoInput } from './FfmpegJob.js';

export default class FfmpegVideoInputs {
  /** The first real video stream – not an attached cover image – or `null` if there is none */
  static fromProbeResult(path: string, probeResult: ExtendedProbeResult): FfmpegVideoInput | null {
    const videoStream = probeResult.streams.find((stream) => stream.codec_type === 'video' && !stream.disposition.attached_pic);
    if (videoStream == null || videoStream.codec_type !== 'video') {
      return null;
    }

    return {
      path,
      codecName: videoStream.codec_name ?? 'unknown',
      pixelFormat: videoStream.pix_fmt ?? null,
      width: videoStream.width,
      height: videoStream.height,
    };
  }
}
