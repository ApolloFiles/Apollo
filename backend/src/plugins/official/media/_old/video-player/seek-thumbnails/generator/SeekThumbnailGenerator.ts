import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../../../files/local/LocalFile.js';
import FileNameCollator from '../../../../../../../files/util/FileNameCollator.js';
import type { Accel } from '../../../../../ffmpeg/accel/Accel.js';
import type { FfmpegVideoInput } from '../../../../../ffmpeg/job/FfmpegJob.js';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import FfmpegVideoInputs from '../../../../../ffmpeg/job/FfmpegVideoInputs.js';
import CachedFfprobeExecutor from '../../../../../ffmpeg/probe/CachedFfprobeExecutor.js';
import type { FfmpegLogLine } from '../../../../../ffmpeg/process/FfmpegLogLineParser.js';

export type GeneratedSeekThumbnails = {
  thumbnailFiles: string[],
  frameTimes: number[]
}

@singleton()
export default class SeekThumbnailGenerator {
  public static readonly GRID_SIZE = 9;
  private static readonly THUMBNAIL_WIDTH = 240;

  constructor(
    private readonly ffprobeExecutor: CachedFfprobeExecutor,
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async generate(inputFile: LocalFile, targetDir: string): Promise<GeneratedSeekThumbnails> {
    const input = FfmpegVideoInputs.fromProbeResult(inputFile.getAbsolutePathOnHost(), await this.ffprobeExecutor.probeFull(inputFile));
    if (input == null) {
      throw new Error(`${inputFile.getAbsolutePathOnHost()} has no video stream to generate seek thumbnails from`);
    }

    const frameTimes = await this.runFrameExtraction(input, targetDir);
    const frameFiles = await this.collectImageFiles(targetDir);
    frameFiles.sort(FileNameCollator.compare);

    return {
      thumbnailFiles: frameFiles,
      frameTimes,
    };
  }

  private async runFrameExtraction(input: FfmpegVideoInput, targetDir: string): Promise<number[]> {
    return this.ffmpegJobRunner.run({
      name: 'seek-thumbnail-generation',
      // QSV decoders ignore '-skip_frame' and would decode every frame
      acceleration: { input, gpuFilters: true, videoEncoder: null, excludedApis: ['qsv'] },
      spawnOptions: { cwd: targetDir },

      buildArgs: (accel) => SeekThumbnailGenerator.buildArgs(accel, input),

      awaitOutcome: async (handle) => {
        const frameTimes: number[] = [];
        handle.on('log', (logLine) => {
          const frameTime = SeekThumbnailGenerator.parseFrameTime(logLine);
          if (frameTime != null) {
            frameTimes.push(frameTime);
          }
        });

        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Seek thumbnail generation failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }

        if ((await this.collectImageFiles(targetDir)).length === 0) {
          throw new Error(`Seek thumbnail generation produced no images:\n${handle.getLogProblems()}`);
        }
        return frameTimes;
      },

      discardOutput: () => this.discardGeneratedImages(targetDir),
    });
  }

  static buildArgs(accel: Accel, input: FfmpegVideoInput): string[] {
    return [
      ...accel.inputArgs(),
      '-skip_frame', 'nokey',

      '-i', input.path,
      '-map', '0:V:0',

      '-vf', [
        'select=key',
        accel.scale(SeekThumbnailGenerator.THUMBNAIL_WIDTH, -2),
        ...accel.download(),
        'showinfo',
        `tile=${SeekThumbnailGenerator.GRID_SIZE}x${SeekThumbnailGenerator.GRID_SIZE}`,
      ].join(','),

      '-an',
      '-fps_mode', 'passthrough',  // prevent ffmpeg from duplicating each output frame to accommodate the originally detected frame rate

      'keyframes_%03d.jpg',
    ];
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

  private static parseFrameTime(logLine: FfmpegLogLine): number | null {
    if (!logLine.component?.startsWith('Parsed_showinfo_')) {
      return null;
    }

    // 'showinfo' also logs its configuration, side data and color properties, none of which name a frame
    const frameTimeMatch = /\bpts_time:(\S+)/.exec(logLine.message);
    if (frameTimeMatch == null) {
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
