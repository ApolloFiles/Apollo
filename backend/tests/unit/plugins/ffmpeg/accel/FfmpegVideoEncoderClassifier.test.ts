import { describe, expect, test } from 'vitest';
import FfmpegVideoEncoderClassifier from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegVideoEncoderClassifier.js';

describe('FfmpegVideoEncoderClassifier#classify', () => {
  test.each([
    ['h264_nvenc', 'cuda'],
    ['hevc_nvenc', 'cuda'],
    ['av1_nvenc', 'cuda'],
    ['h264_qsv', 'qsv'],
    ['vp9_qsv', 'qsv'],
    ['h264_vaapi', 'vaapi'],
    ['mjpeg_vaapi', 'vaapi'],
  ])('Maps %s onto the %s acceleration', (encoder, acceleration) => {
    expect(FfmpegVideoEncoderClassifier.classify(encoder)).toEqual({ type: 'hardware', acceleration });
  });

  test.each(['h264_amf', 'h264_vulkan', 'prores_ks_vulkan', 'h264_v4l2m2m', 'h264_videotoolbox', 'h264_mediacodec'])(
    'Recognises %s as hardware Apollo cannot decode with',
    (encoder) => {
      expect(FfmpegVideoEncoderClassifier.classify(encoder)).toEqual({ type: 'hardware', acceleration: null });
    },
  );

  test('Recognises the software encoder Apollo picks between', () => {
    expect(FfmpegVideoEncoderClassifier.classify('libx264')).toEqual({ type: 'software' });
  });

  test.each(['prores_ks', 'alias_pix', 'wrapped_avframe', 'h264_madeup', 'libx265'])(
    'Does not guess at %s',
    (encoder) => {
      expect(FfmpegVideoEncoderClassifier.classify(encoder)).toEqual({ type: 'unknown' });
    },
  );

  test('Does not mistake an encoder that merely contains an acceleration name for hardware', () => {
    expect(FfmpegVideoEncoderClassifier.classify('nvenc_something')).toEqual({ type: 'unknown' });
  });
});
