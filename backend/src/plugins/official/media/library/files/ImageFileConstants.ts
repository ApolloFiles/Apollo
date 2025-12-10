import type sharp from 'sharp';

export default class ImageFileConstants {
  public static readonly POSTER_OPTIONS_AVIF: sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly POSTER_OPTIONS_JPEG: sharp.JpegOptions = { quality: 85, optimiseScans: true } as const;

  public static readonly BACKDROP_OPTIONS_AVIF: sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly BACKDROP_OPTIONS_JPEG: sharp.JpegOptions = { quality: 85, optimiseScans: true } as const;

  public static readonly THUMBNAIL_OPTIONS_AVIF: sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly THUMBNAIL_OPTIONS_JPEG: sharp.JpegOptions = { quality: 85, optimiseScans: true } as const;
}
