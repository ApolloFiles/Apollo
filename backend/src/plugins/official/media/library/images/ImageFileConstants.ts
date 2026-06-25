import type * as Sharp from 'sharp';

export default class ImageFileConstants {
  public static readonly POSTER_OPTIONS_AVIF: Sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly POSTER_OPTIONS_JPEG: Sharp.JpegOptions = { quality: 85, optimiseScans: true } as const;

  public static readonly BACKDROP_OPTIONS_AVIF: Sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly BACKDROP_OPTIONS_JPEG: Sharp.JpegOptions = { quality: 85, optimiseScans: true } as const;

  public static readonly THUMBNAIL_OPTIONS_AVIF: Sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly THUMBNAIL_OPTIONS_JPEG: Sharp.JpegOptions = { quality: 85, optimiseScans: true } as const;

  public static readonly LOGO_OPTIONS_AVIF: Sharp.AvifOptions = { effort: 3, quality: 60 } as const;
  public static readonly LOGO_OPTIONS_PNG: Sharp.PngOptions = {} as const;
}
