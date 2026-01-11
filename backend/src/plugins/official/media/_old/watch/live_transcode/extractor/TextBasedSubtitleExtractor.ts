import Fs from 'node:fs';
import Path from 'node:path';
import type { ExtendedVideoAnalysis, Stream, SubtitleStream } from '../../../video/analyser/VideoAnalyser.Types.js';
import FfmpegProcess from '../FfmpegProcess.js';
import { ISO639_2ToISO639_1Mapping } from './language/ISO639_2ToISO639_1Mapping.js';

export interface ExtractedSubtitle {
  readonly fileName: string;

  readonly title: string;
  readonly language: string;
  readonly codecName: string;
}

export default class TextBasedSubtitleExtractor {
  private static readonly SUPPORTED: { [codec: string]: string /* file extension */ } = {
    'ass': 'ass',
    'webvtt': 'vtt',
  };
  private static readonly CONVERSION_TARGETS: { [codec: string]: string /* one of supported codec */ } = {
    'ssa': 'ass',

    'subrip': 'ass',
    'subviewer': 'ass',
    'subviewer1': 'ass',

    'microdvd': 'ass',
    'mpl2': 'ass',
    'pjs': 'ass',
    'stl': 'ass',

    'realtext': 'ass', // Conversion might lose styling, but should work
    'jacosub': 'ass', // Conversion might produce broken/different subtitles (not 100% lossless)
    'sami': 'ass', // supposedly 'Often broken, inconsistent encodings' and might need pre-processing
    'vplayer': 'ass', // Conversion might have timing/sync problems
  };

  static async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedSubtitle[]> {
    const extractedSubtitles: ExtractedSubtitle[] = [];

    for (const stream of videoAnalysis.streams) {
      if (!this.isSupportedTextBasedSubtitleStream(stream)) {
        if (stream.codecType === 'subtitle') {
          console.debug('[TextBasedSubtitleExtractor] Skipping unsupported subtitle stream:', stream.codecName);
        }
        continue;
      }

      const codedToConvertTo: string | null = this.CONVERSION_TARGETS[stream.codecName] ?? null;

      let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
      if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
        iso639_2LanguageTag = 'und';
      }

      const iso639_1LanguageTag = (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag);
      const streamTitle = (stream.tags.title ?? iso639_1LanguageTag).replace(/"/g, ''); // TODO: Do we have to remove "?

      const fileName = `${iso639_1LanguageTag}.${stream.index}.${this.SUPPORTED[codedToConvertTo ?? stream.codecName]}`;
      const subtitleTargetPath = Path.join(targetDir, fileName);
      const ffmpegArgs = [
        '-bitexact',
        '-loglevel', 'warning',
        '-n',

        '-fix_sub_duration',

        '-i', videoFile,
        '-map', `0:${stream.index}`,

        '-c:s', (codedToConvertTo ?? stream.codecName),

        subtitleTargetPath,
      ];

      await Fs.promises.mkdir(targetDir, { recursive: true });

      const ffmpegProcess = new FfmpegProcess(ffmpegArgs, { cwd: targetDir, stdio: 'ignore' });
      await ffmpegProcess.waitForSuccessExit();

      extractedSubtitles.push({
        fileName,

        title: streamTitle,
        language: iso639_1LanguageTag,
        codecName: codedToConvertTo ?? stream.codecName,
      });
    }

    return extractedSubtitles;
  }

  static isSupportedTextBasedSubtitleStream(stream: Stream): stream is SubtitleStream {
    return stream.codecType === 'subtitle' && (this.SUPPORTED[stream.codecName] != null || this.CONVERSION_TARGETS[stream.codecName] != null);
  }
}
