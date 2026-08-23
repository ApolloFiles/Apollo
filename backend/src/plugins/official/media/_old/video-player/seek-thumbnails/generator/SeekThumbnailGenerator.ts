import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import FileNameCollator from '../../../../../../../files/util/FileNameCollator.js';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import type { FfmpegLogLine } from '../../../../../ffmpeg/process/FfmpegLogLineParser.js';

export type GeneratedSeekThumbnails = {
  thumbnailFiles: string[],
  frameTimes: number[]
}

@singleton()
export default class SeekThumbnailGenerator {
  public static readonly GRID_SIZE = 9;

  constructor(
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async generate(inputFile: string, targetDir: string): Promise<GeneratedSeekThumbnails> {
    const frameTimes = await this.runFrameExtraction(inputFile, targetDir);
    const frameFiles = await this.collectImageFiles(targetDir);
    frameFiles.sort(FileNameCollator.compare);

    return {
      thumbnailFiles: frameFiles,
      frameTimes,
    };
  }

  private async runFrameExtraction(inputFile: string, targetDir: string): Promise<number[]> {
    return this.ffmpegJobRunner.run({
      name: 'seek-thumbnail-generation',
      acceleration: { mayUseHardwareDecoding: true },
      // The time of each selected frame is only available from the debug output of the 'select' filter
      spawnOptions: { cwd: targetDir, logVerbosity: 'debug' },

      buildArgs: (profile) => [
        '-skip_frame', 'nokey',
        ...(profile.decodeAcceleration != null ? ['-hwaccel', profile.decodeAcceleration] : []),

        '-i', inputFile,
        '-vf', `select=key,scale=240:-2,tile=${SeekThumbnailGenerator.GRID_SIZE}x${SeekThumbnailGenerator.GRID_SIZE}`,
        '-an',  // blocks all audio streams
        '-fps_mode', 'passthrough',  // prevent ffmpeg from duplicating each output frame to accommodate the originally detected frame rate
        'keyframes_%03d.jpg',
      ],

      awaitOutcome: async (handle) => {
        const frameTimes: number[] = [];
        handle.on('log', (logLine) => {
          const frameTime = SeekThumbnailGenerator.parseSelectedFrameTime(logLine);
          if (frameTime != null) {
            frameTimes.push(frameTime);
          }
        });

        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Seek thumbnail generation failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }

        return frameTimes;
      },

      discardOutput: () => this.discardGeneratedImages(targetDir),
    });
  }

  private async discardGeneratedImages(targetDir: string): Promise<void> {
    const filePaths = await this.collectImageFiles(targetDir);
    await Promise.all(filePaths.map((filePath) => Fs.promises.rm(filePath, { force: true })));
  }

  private async collectImageFiles(directoryPath: string): Promise<string[]> {
    return (await Fs.promises.readdir(directoryPath))
      .filter((fileName) => fileName.startsWith('keyframes_'))
      .map((fileName) => Path.join(directoryPath, fileName));
  }

  private static parseSelectedFrameTime(logLine: FfmpegLogLine): number | null {
    if (logLine.component !== 'Parsed_select_0' || !logLine.message.includes(' -> select:1.0')) {
      return null;
    }

    const frameTimeMatch = / t:(\S+)/.exec(logLine.message);
    if (frameTimeMatch == null) {
      console.warn('Failed to find the frame time in:', logLine.raw);
      return null;
    }

    const frameTime = parseFloat(frameTimeMatch[1]);
    if (!Number.isFinite(frameTime)) {
      console.warn('Failed to parse the frame time as a float:', frameTimeMatch[1]);
      return null;
    }
    return frameTime;
  }
}
