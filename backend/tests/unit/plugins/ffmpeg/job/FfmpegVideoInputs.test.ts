import { describe, expect, test } from 'vitest';
import FfmpegVideoInputs from '../../../../../src/plugins/official/ffmpeg/job/FfmpegVideoInputs.js';
import type { ExtendedProbeResult } from '../../../../../src/plugins/official/ffmpeg/probe/FfprobeExecutor.js';

function probeResult(streams: Record<string, unknown>[]): ExtendedProbeResult {
  return { streams } as unknown as ExtendedProbeResult;
}

const COVER_ART = { codec_type: 'video', codec_name: 'mjpeg', pix_fmt: 'yuvj420p', disposition: { attached_pic: true } };
const AUDIO = { codec_type: 'audio', codec_name: 'aac', disposition: {} };
const VIDEO = { codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le', width: 3840, height: 2160, disposition: { attached_pic: false } };

describe('FfmpegVideoInputs.fromProbeResult', () => {
  test('Describes the real video stream, skipping attached cover art', () => {
    expect(FfmpegVideoInputs.fromProbeResult('/media/in.mkv', probeResult([COVER_ART, AUDIO, VIDEO]))).toEqual({
      path: '/media/in.mkv',
      codecName: 'hevc',
      pixelFormat: 'yuv420p10le',
      width: 3840,
      height: 2160,
    });
  });

  test('Has nothing to say about a file without video', () => {
    expect(FfmpegVideoInputs.fromProbeResult('/media/in.mkv', probeResult([AUDIO, COVER_ART]))).toBeNull();
  });

  test('Copes with a stream ffprobe could not name', () => {
    const stream = { codec_type: 'video', width: 640, height: 360, disposition: {} };

    expect(FfmpegVideoInputs.fromProbeResult('/media/in.mkv', probeResult([stream]))).toEqual({
      path: '/media/in.mkv',
      codecName: 'unknown',
      pixelFormat: null,
      width: 640,
      height: 360,
    });
  });
});
