import { describe, expect, test } from 'vitest';
import PixelFormatUtil from '../../../../../src/plugins/official/ffmpeg/accel/PixelFormatUtil.js';

describe('PixelFormatUtil.determineBitDepth', () => {
  test.each(['yuv420p', 'yuvj420p', 'nv12', 'yuv444p', 'yuv410p', 'gray', 'rgb24', 'pal8', 'gbrp', null])('%s is 8-bit', (pixelFormat) => {
    expect(PixelFormatUtil.determineBitDepth(pixelFormat)).toBe(8);
  });

  test.each(['yuv420p10le', 'yuv420p10be', 'yuv422p10le', 'yuv420p9le', 'yuv420p12le', 'yuv444p16le', 'p010le', 'p010', 'gbrp16le', 'gray10le'])('%s needs converting like 10-bit', (pixelFormat) => {
    expect(PixelFormatUtil.determineBitDepth(pixelFormat)).toBe(10);
  });

  test('Treats a format it has never heard of as one that needs converting', () => {
    expect(PixelFormatUtil.determineBitDepth('some_future_format')).toBe(10);
  });
});
