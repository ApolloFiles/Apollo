import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import type { ExtendedVideoAnalysis } from '../../../video/analyser/VideoAnalyser.Types.js';

export interface ExtractedFont {
  readonly fileName: string;

  readonly streamIndex: number;
  /** What the attachment announces, so a dump cut short can be told from a finished one */
  readonly byteSize: number;
}

@singleton()
export default class FontExtractor {
  private static readonly SUPPORTED_FONTS = ['ttf', 'otf', 'woff'];

  constructor(
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedFont[]> {
    const targets = FontExtractor.planExtraction(videoAnalysis);
    if (targets.length === 0) {
      return [];
    }

    await Fs.promises.mkdir(targetDir, { recursive: true });
    // Only what this run writes may reach a player: whatever sits at a target path now is not a font of this file
    await this.discardOutputs(targets, targetDir);
    await this.dumpAttachments(videoFile, targets, targetDir);

    const dumped = await Promise.all(targets.map((target) => FontExtractor.isDumpedInFull(targetDir, target)));
    const extractedFonts = targets.filter((_target, index) => dumped[index]);
    if (extractedFonts.length !== targets.length) {
      console.warn(`Only ${extractedFonts.length} of ${targets.length} fonts attached to ${videoFile} could be extracted`);
    }
    return extractedFonts;
  }

  /**
   * FFmpeg refuses to overwrite, so two attachments sharing a sanitized file name would abort the dump of every
   * attachment behind them – only the first one of them is asked for.
   */
  static planExtraction(videoAnalysis: ExtendedVideoAnalysis): ExtractedFont[] {
    const targetsByFileName = new Map<string, ExtractedFont>();

    for (const stream of videoAnalysis.streams) {
      if (stream.codecType !== 'attachment' || typeof stream.tags?.filename != 'string') {
        continue;
      }

      if (!FontExtractor.SUPPORTED_FONTS.includes(stream.codecName)) {
        continue;
      }

      const fileName = FontExtractor.createSafeFilename(stream.tags.filename);
      if (fileName === '' || fileName === '.' || fileName === '..' || targetsByFileName.has(fileName)) {
        continue;
      }
      targetsByFileName.set(fileName, { fileName, streamIndex: stream.index, byteSize: stream.extraDataSize || 0 });
    }

    return Array.from(targetsByFileName.values());
  }

  static buildArgs(videoFile: string, targetDir: string, targets: readonly ExtractedFont[]): string[] {
    return [
      '-bitexact',
      '-n',

      ...targets.flatMap((target) => [
        `-dump_attachment:${target.streamIndex}`,
        Path.join(targetDir, target.fileName),
      ]),

      '-i', videoFile,
    ];
  }

  /** Attachments live in the container header, so one process dumps all of them without demuxing anything. */
  private async dumpAttachments(videoFile: string, targets: readonly ExtractedFont[], targetDir: string): Promise<void> {
    await this.ffmpegJobRunner.run({
      name: 'subtitle-font-extraction',
      acceleration: null,
      spawnOptions: { cwd: targetDir, logVerbosity: 'warning' },

      buildArgs: () => FontExtractor.buildArgs(videoFile, targetDir, targets),

      // FFmpeg has nothing left to write once the attachments are dumped, so it always ends up 'failing'
      awaitOutcome: async (handle) => {
        await handle.waitForExit();
      },
    });
  }

  private async discardOutputs(targets: readonly ExtractedFont[], targetDir: string): Promise<void> {
    await Promise.all(targets.map((target) => Fs.promises.rm(Path.join(targetDir, target.fileName), { force: true })));
  }

  /** An attachment's bytes are the stream's extradata, so what it announces says whether the dump ran to the end */
  private static async isDumpedInFull(targetDir: string, target: ExtractedFont): Promise<boolean> {
    return Fs.promises.stat(Path.join(targetDir, target.fileName))
      .then((stats) => stats.size > 0 && stats.size >= target.byteSize, () => false);
  }

  private static createSafeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
  }
}
