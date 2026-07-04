import type { ExtendedVideoAnalysis, Stream, SubtitleStream } from '../../../video/analyser/VideoAnalyser.Types.js';
import { ISO639_2ToISO639_1Mapping } from '../../../watch/live_transcode/extractor/language/ISO639_2ToISO639_1Mapping.js';

export interface ImageBasedSubtitleInfo {
  /** The absolute ffmpeg input stream index. Used both to build the overlay filter and as the client-facing selector. */
  readonly streamIndex: number;

  readonly title: string;
  readonly language: string;
  readonly codecName: string;
}

/**
 * Central definition of which subtitle streams are "bitmap/image based" and can be burned into the video ("hard subs").
 * Mirrors {@link TextBasedSubtitleExtractor.isSupportedTextBasedSubtitleStream} for the text-based case.
 */
export default class ImageBasedSubtitleHelper {
  /** Subtitle codecs that ffmpeg can burn into the video via the `overlay` filter. */
  static readonly SUPPORTED_CODECS = ['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle'];

  static isSupportedImageBasedSubtitleStream(stream: Stream): stream is SubtitleStream {
    return stream.codecType === 'subtitle' && this.SUPPORTED_CODECS.includes(stream.codecName);
  }

  static listSupportedImageBasedSubtitleStreams(videoAnalysis: ExtendedVideoAnalysis): ImageBasedSubtitleInfo[] {
    const result: ImageBasedSubtitleInfo[] = [];

    for (const stream of videoAnalysis.streams) {
      if (!this.isSupportedImageBasedSubtitleStream(stream)) {
        continue;
      }

      let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
      if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
        iso639_2LanguageTag = 'und';
      }
      const language = (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag);

      result.push({
        streamIndex: stream.index,
        title: (stream.tags.title ?? language).replace(/"/g, ''),
        language,
        codecName: stream.codecName,
      });
    }

    return result;
  }
}
