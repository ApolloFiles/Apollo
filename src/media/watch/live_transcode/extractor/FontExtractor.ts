import Fs from 'node:fs';
import Path from 'node:path';
import {ExtendedVideoAnalysis} from '../../../video/analyser/VideoAnalyser.Types';
import FfmpegProcess from '../FfmpegProcess';

export interface ExtractedFont {
  readonly fileName: string;
}

export default class FontExtractor {
  private static readonly SUPPORTED_FONTS = ['ttf', 'otf', 'woff'];

  static async extract(videoFile: string, videoAnalysis: ExtendedVideoAnalysis, targetDir: string): Promise<ExtractedFont[]> {
    const extractedFontFiles: ExtractedFont[] = [];

    for (const stream of videoAnalysis.streams) {
      if (stream.codecType !== 'attachment' || typeof stream.tags?.filename != 'string') {
        continue;
      }

      if (!this.SUPPORTED_FONTS.includes(stream.codecName)) {
        continue;
      }

      const fileName = this.createSafeFilename(stream.tags.filename);
      const fontTargetPath = Path.join(targetDir, fileName);
      const ffmpegArgs = [
        '-bitexact',
        '-loglevel', 'warning',
        '-n',

        `-dump_attachment:${stream.index}`,
        fontTargetPath,

        '-i', videoFile
      ];

      await Fs.promises.mkdir(targetDir, {recursive: true});

      const ffmpegProcess = new FfmpegProcess(ffmpegArgs, {cwd: targetDir, stdio: 'ignore'});
      await ffmpegProcess.waitForExit();

      extractedFontFiles.push({fileName});
    }

    return extractedFontFiles;
  }

  private static createSafeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
  }
}
