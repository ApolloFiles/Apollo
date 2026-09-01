import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import type { ExtendedVideoAnalysis, Stream, SubtitleStream } from '../../../video/analyser/VideoAnalyser.Types.js';
import { ISO639_2ToISO639_1Mapping } from './language/ISO639_2ToISO639_1Mapping.js';

export interface ExtractedSubtitle {
  readonly fileName: string;

  readonly title: string;
  readonly language: string;
  readonly codecName: string;
}

@singleton()
export default class TextBasedSubtitleExtractor {
  private static readonly SUPPORTED: { [codec: string]: string /* file extension */ } = {
    'ass': 'ass',
  };
  private static readonly CONVERSION_TARGETS: { [codec: string]: string /* one of supported codec */ } = {
    'ssa': 'ass', // A video player supporting ass, should support ssa, but if we pre-process anyway...
    'webvtt': 'ass',  // HTML's <track> element does not support applying a delay/offset, so live transcode breaks

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

  constructor(
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedSubtitle[]> {
    const extractedSubtitles: ExtractedSubtitle[] = [];

    for (const stream of videoAnalysis.streams) {
      if (!TextBasedSubtitleExtractor.isSupportedTextBasedSubtitleStream(stream)) {
        if (stream.codecType === 'subtitle') {
          console.debug('[TextBasedSubtitleExtractor] Skipping unsupported subtitle stream:', stream.codecName);
        }
        continue;
      }

      const codedToConvertTo: string | null = TextBasedSubtitleExtractor.CONVERSION_TARGETS[stream.codecName] ?? null;

      let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
      if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
        iso639_2LanguageTag = 'und';
      }

      const iso639_1LanguageTag = (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag);
      const streamTitle = (stream.tags.title ?? iso639_1LanguageTag).replace(/"/g, ''); // TODO: Do we have to remove "?

      const fileName = `${iso639_1LanguageTag}.${stream.index}.${TextBasedSubtitleExtractor.SUPPORTED[codedToConvertTo ?? stream.codecName]}`;

      await Fs.promises.mkdir(targetDir, { recursive: true });
      await this.extractStream(videoFile, stream.index, codedToConvertTo ?? stream.codecName, Path.join(targetDir, fileName), targetDir);

      extractedSubtitles.push({
        fileName,

        title: streamTitle,
        language: iso639_1LanguageTag,
        codecName: codedToConvertTo ?? stream.codecName,
      });
    }

    return extractedSubtitles;
  }

  private async extractStream(videoFile: string, streamIndex: number, subtitleCodec: string, subtitleTargetPath: string, targetDir: string): Promise<void> {
    await this.ffmpegJobRunner.run({
      name: 'text-based-subtitle-extraction',
      acceleration: null,
      spawnOptions: { cwd: targetDir, logVerbosity: 'warning' },

      buildArgs: () => [
        '-bitexact',
        '-n',

        '-fix_sub_duration',

        '-i', videoFile,
        '-map', `0:${streamIndex}`,

        '-c:s', subtitleCodec,

        subtitleTargetPath,
      ],

      awaitOutcome: async (handle) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Extracting the subtitle stream ${streamIndex} of ${videoFile} failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }
      },
    });
  }

  static isSupportedTextBasedSubtitleStream(stream: Stream): stream is SubtitleStream {
    return stream.codecType === 'subtitle' && (this.SUPPORTED[stream.codecName] != null || this.CONVERSION_TARGETS[stream.codecName] != null);
  }
}
