import PixelFormatUtil from '#src/plugins/official/ffmpeg/accel/PixelFormatUtil.js';

describe(PixelFormatUtil, () => {
  test.for([
    { pixelFormat: 'yuv420p' },
    { pixelFormat: 'yuvj420p' },
    { pixelFormat: 'nv12' },
    { pixelFormat: 'yuv444p' },
    { pixelFormat: 'yuv410p' },
    { pixelFormat: 'gray' },
    { pixelFormat: 'rgb24' },
    { pixelFormat: 'pal8' },
    { pixelFormat: 'gbrp' },
    { pixelFormat: null },
  ])('Reports $pixelFormat as 8-bit', ({ pixelFormat }) => {
    expect(PixelFormatUtil.determineBitDepth(pixelFormat)).toBe(8);
  });

  test.for([
    { pixelFormat: 'yuv420p10le' },
    { pixelFormat: 'yuv420p10be' },
    { pixelFormat: 'yuv422p10le' },
    { pixelFormat: 'yuv420p9le' },
    { pixelFormat: 'yuv420p12le' },
    { pixelFormat: 'yuv444p16le' },
    { pixelFormat: 'p010le' },
    { pixelFormat: 'p010' },
    { pixelFormat: 'gbrp16le' },
    { pixelFormat: 'gray10le' },
  ])('Reports $pixelFormat as 10-bit, since it needs converting like 10-bit', ({ pixelFormat }) => {
    expect(PixelFormatUtil.determineBitDepth(pixelFormat)).toBe(10);
  });

  test('Treats a format it has never heard of as one that needs converting', () => {
    expect(PixelFormatUtil.determineBitDepth('some_future_format')).toBe(10);
  });
});
