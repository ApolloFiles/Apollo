import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import type { ExtendedVideoAnalysis } from '../../../video/analyser/VideoAnalyser.Types.js';

export interface ExtractedFont {
  readonly fileName: string;
}

@singleton()
export default class FontExtractor {
  private static readonly SUPPORTED_FONTS = ['ttf', 'otf', 'woff'];

  constructor(
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedFont[]> {
    const extractedFontFiles: ExtractedFont[] = [];

    for (const stream of videoAnalysis.streams) {
      if (stream.codecType !== 'attachment' || typeof stream.tags?.filename != 'string') {
        continue;
      }

      if (!FontExtractor.SUPPORTED_FONTS.includes(stream.codecName)) {
        continue;
      }

      const fileName = FontExtractor.createSafeFilename(stream.tags.filename);
      await Fs.promises.mkdir(targetDir, { recursive: true });
      await this.dumpAttachment(videoFile, stream.index, Path.join(targetDir, fileName), targetDir);

      extractedFontFiles.push({ fileName });
    }

    return extractedFontFiles;
  }

  private async dumpAttachment(videoFile: string, streamIndex: number, fontTargetPath: string, targetDir: string): Promise<void> {
    await this.ffmpegJobRunner.run({
      name: 'subtitle-font-extraction',
      acceleration: null,
      spawnOptions: { cwd: targetDir, logVerbosity: 'warning' },

      buildArgs: () => [
        '-bitexact',
        '-n',

        `-dump_attachment:${streamIndex}`,
        fontTargetPath,

        '-i', videoFile,
      ],

      // FFmpeg has nothing left to write once the attachment is dumped, so it always ends up 'failing'
      awaitOutcome: async (handle) => {
        await handle.waitForExit();
      },
    });
  }

  private static createSafeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
  }
}
