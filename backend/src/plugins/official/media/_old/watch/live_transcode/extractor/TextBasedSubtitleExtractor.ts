import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { runWithConcurrency } from '../../../../../../../utils/concurrency.js';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import type { ExtendedVideoAnalysis, Stream, SubtitleStream } from '../../../video/analyser/VideoAnalyser.Types.js';
import { ISO639_2ToISO639_1Mapping } from './language/ISO639_2ToISO639_1Mapping.js';

export interface ExtractedSubtitle {
  readonly fileName: string;

  readonly streamIndex: number;
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

  private static readonly RETRY_CONCURRENCY = 4;

  constructor(
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedSubtitle[]> {
    const targets = TextBasedSubtitleExtractor.planExtraction(videoAnalysis);
    if (targets.length === 0) {
      return [];
    }

    await Fs.promises.mkdir(targetDir, { recursive: true });

    let batchError: unknown = null;
    try {
      await this.runExtraction(videoFile, targets, targetDir);
    } catch (err) {
      batchError = err;
    }

    // An output file FFmpeg refuses to open still leaves it with exit code 0, so a batch can report success half-written
    let missing = await this.findMissingOutputs(targets, targetDir);
    if (missing.length > 0) {
      console.warn(`Extracting ${missing.length} of ${targets.length} text-based subtitle streams of ${videoFile} in one pass did not work out – retrying them one by one`, batchError);
      await this.retryMissingStreams(videoFile, missing, targetDir);
      missing = await this.findMissingOutputs(targets, targetDir);
    }

    if (missing.length === targets.length) {
      throw batchError ?? new Error(`None of the ${targets.length} text-based subtitle streams of ${videoFile} could be extracted`);
    }
    return targets.filter((target) => !missing.includes(target));
  }

  static planExtraction(videoAnalysis: ExtendedVideoAnalysis): ExtractedSubtitle[] {
    const targets: ExtractedSubtitle[] = [];

    for (const stream of videoAnalysis.streams) {
      if (!TextBasedSubtitleExtractor.isSupportedTextBasedSubtitleStream(stream)) {
        if (stream.codecType === 'subtitle') {
          console.debug('[TextBasedSubtitleExtractor] Skipping unsupported subtitle stream:', stream.codecName);
        }
        continue;
      }

      const codecName = TextBasedSubtitleExtractor.CONVERSION_TARGETS[stream.codecName] ?? stream.codecName;
      const language = TextBasedSubtitleExtractor.determineLanguageTag(stream);

      targets.push({
        fileName: `${language}.${stream.index}.${TextBasedSubtitleExtractor.SUPPORTED[codecName]}`,

        streamIndex: stream.index,
        title: (stream.tags.title ?? language).replace(/"/g, ''), // TODO: Do we have to remove "?
        language,
        codecName,
      });
    }

    return targets;
  }

  static buildArgs(videoFile: string, targetDir: string, targets: readonly ExtractedSubtitle[]): string[] {
    return [
      '-bitexact',
      '-n',

      '-fix_sub_duration',

      '-i', videoFile,

      ...targets.flatMap((target) => [
        '-map', `0:${target.streamIndex}`,

        '-c:s', target.codecName,

        Path.join(targetDir, target.fileName),
      ]),
    ];
  }

  static isSupportedTextBasedSubtitleStream(stream: Stream): stream is SubtitleStream {
    return stream.codecType === 'subtitle' && (this.SUPPORTED[stream.codecName] != null || this.CONVERSION_TARGETS[stream.codecName] != null);
  }

  /** One FFmpeg process writes every target: the input is opened and demuxed once instead of once per stream. */
  private async runExtraction(videoFile: string, targets: readonly ExtractedSubtitle[], targetDir: string): Promise<void> {
    await this.ffmpegJobRunner.run({
      name: 'text-based-subtitle-extraction',
      acceleration: null,
      spawnOptions: { cwd: targetDir, logVerbosity: 'warning' },

      buildArgs: () => TextBasedSubtitleExtractor.buildArgs(videoFile, targetDir, targets),

      awaitOutcome: async (handle) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Extracting the subtitle streams ${TextBasedSubtitleExtractor.describeOutputs(targets)} of ${videoFile} failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }
      },

      // One demuxer feeds every muxer, so a process dying mid-pass truncates all of them alike – none may be kept
      discardOutput: () => this.discardOutputs(targets, targetDir),
    });
  }

  /** A stream FFmpeg refuses to set up takes the whole batch down with it, so the survivors are collected one by one. */
  private async retryMissingStreams(videoFile: string, missing: readonly ExtractedSubtitle[], targetDir: string): Promise<void> {
    await this.discardOutputs(missing, targetDir);  // the empty files a failed batch leaves behind would block the retry

    await runWithConcurrency(missing, TextBasedSubtitleExtractor.RETRY_CONCURRENCY, async (target) => {
      try {
        await this.runExtraction(videoFile, [target], targetDir);
      } catch (err) {
        console.warn(`Skipping the subtitle stream ${target.streamIndex} of ${videoFile}`, err);
      }
    });
  }

  private async findMissingOutputs(targets: readonly ExtractedSubtitle[], targetDir: string): Promise<ExtractedSubtitle[]> {
    const written = await Promise.all(targets.map((target) => TextBasedSubtitleExtractor.hasContent(Path.join(targetDir, target.fileName))));
    return targets.filter((_target, index) => !written[index]);
  }

  private async discardOutputs(targets: readonly ExtractedSubtitle[], targetDir: string): Promise<void> {
    await Promise.all(targets.map((target) => Fs.promises.rm(Path.join(targetDir, target.fileName), { force: true })));
  }

  private static async hasContent(filePath: string): Promise<boolean> {
    return Fs.promises.stat(filePath).then((stats) => stats.size > 0, () => false);
  }

  private static describeOutputs(targets: readonly ExtractedSubtitle[]): string {
    return targets.map((target, index) => `#${index}=0:${target.streamIndex}`).join(', ');
  }

  private static determineLanguageTag(stream: SubtitleStream): string {
    let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
    if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
      iso639_2LanguageTag = 'und';
    }

    return (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag);
  }
}
