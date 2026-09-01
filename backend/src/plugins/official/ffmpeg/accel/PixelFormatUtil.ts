export type VideoBitDepth = 8 | 10;

/**
 * Only the two depths that decide something are told apart: 8-bit frames travel as `nv12`, everything deeper as
 * `p010` and needs converting before an 8-bit encoder sees it. Anything not known to be 8-bit – a 9-, 12- or 16-bit
 * format, or one this list has never heard of – is treated as 10-bit, because that is the path that converts;
 * guessing 8-bit would hand the encoder frames it rejects.
 */
export default class PixelFormatUtil {
  private static readonly EIGHT_BIT_FORMATS = new Set([
    'yuv420p', 'yuvj420p', 'yuv422p', 'yuvj422p', 'yuv444p', 'yuvj444p', 'yuv410p',
    'yuv411p', 'yuvj411p', 'yuv440p', 'yuvj440p', 'yuva420p', 'yuva422p', 'yuva444p',
    'nv12', 'nv21', 'nv16', 'nv24', 'nv42', 'yuyv422', 'uyvy422', 'yvyu422',
    'gray', 'gray8', 'ya8', 'pal8', 'monob', 'monow', 'rgb24', 'bgr24', 'rgba',
    'bgra', 'argb', 'abgr', 'rgb0', 'bgr0', '0rgb', '0bgr', 'gbrp', 'gbrap',
  ]);

  static determineBitDepth(pixelFormat: string | null): VideoBitDepth {
    if (pixelFormat == null || PixelFormatUtil.EIGHT_BIT_FORMATS.has(pixelFormat)) {
      return 8;
    }
    return 10;
  }
}
