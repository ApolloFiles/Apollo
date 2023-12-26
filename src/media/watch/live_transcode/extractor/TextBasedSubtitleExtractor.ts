import Fs from 'node:fs';
import Path from 'node:path';
import { ExtendedVideoAnalysis, Stream, SubtitleStream } from '../../../video/analyser/VideoAnalyser.Types';
import FfmpegProcess from '../FfmpegProcess';
import { ISO639_2ToISO639_1Mapping } from './language/ISO639_2ToISO639_1Mapping';

export interface ExtractedSubtitle {
  readonly fileName: string;

  readonly title: string;
  readonly language: string;
  readonly codecName: string;
}

export default class TextBasedSubtitleExtractor {
  private static readonly SUPPORTED: { [codec: string]: string } = {
    'ass': 'ass',
    'ssa': 'ssa',
    'webvtt': 'vtt'
  };

  static async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedSubtitle[]> {
    const extractedSubtitles: ExtractedSubtitle[] = [];

    for (const stream of videoAnalysis.streams) {
      if (!this.isSupportedTextBasedSubtitleStream(stream)) {
        continue;
      }

      let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
      if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
        iso639_2LanguageTag = 'und';
      }

      const iso639_1LanguageTag = (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag);
      const streamTitle = (stream.tags.title ?? iso639_1LanguageTag).replace(/"/g, ''); // TODO: Do we have to remove "?

      const fileName = `${iso639_1LanguageTag}.${stream.index}.${this.SUPPORTED[stream.codecName]}`;
      const subtitleTargetPath = Path.join(targetDir, fileName);
      const ffmpegArgs = [
        '-bitexact',
        '-loglevel', 'warning',
        '-n',

        '-i', videoFile,

        '-map', `0:${stream.index}`,
        '-c:s', 'copy',

        subtitleTargetPath
      ];

      await Fs.promises.mkdir(targetDir, { recursive: true });

      const ffmpegProcess = new FfmpegProcess(ffmpegArgs, { cwd: targetDir, stdio: 'ignore' });
      await ffmpegProcess.waitForSuccessExit();

      extractedSubtitles.push({
        fileName,

        title: streamTitle,
        language: iso639_1LanguageTag,
        codecName: stream.codecName
      });
    }

    return extractedSubtitles;
  }

  static isSupportedTextBasedSubtitleStream(stream: Stream): stream is SubtitleStream {
    return stream.codecType === 'subtitle' && this.SUPPORTED[stream.codecName] != null;
  }
}
