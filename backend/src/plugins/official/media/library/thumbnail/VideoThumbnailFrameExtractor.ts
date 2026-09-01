import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import type { Accel } from '../../../ffmpeg/accel/Accel.js';
import type { FfmpegVideoInput } from '../../../ffmpeg/job/FfmpegJob.js';
import FfmpegJobRunner from '../../../ffmpeg/job/FfmpegJobRunner.js';
import FfmpegVideoInputs from '../../../ffmpeg/job/FfmpegVideoInputs.js';
import CachedFfprobeExecutor from '../../../ffmpeg/probe/CachedFfprobeExecutor.js';
import ImageFileConstants from '../images/ImageFileConstants.js';

@singleton()
export default class VideoThumbnailFrameExtractor {
  private static readonly FRAME_FILE_PREFIX = 'frame_';

  private static readonly SAMPLE_SIZE = 5;
  private static readonly FRAMES_PER_SAMPLE = 75;
  private static readonly SEEK_FRACTION = 0.2;
  private static readonly SHORTEST_VIDEO_WORTH_SEEKING_IN = 30;

  constructor(
    private readonly ffprobeExecutor: CachedFfprobeExecutor,
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extractCandidateFrames(file: LocalFile, targetDirectory: string): Promise<string[]> {
    const probeResult = await this.ffprobeExecutor.probeFull(file);
    const input = FfmpegVideoInputs.fromProbeResult(file.getAbsolutePathOnHost(), probeResult);
    if (input == null) {
      throw new Error(`${file.getAbsolutePathOnHost()} has no video stream to extract thumbnail frames from`);
    }
    const seekPosition = VideoThumbnailFrameExtractor.determineSeekPosition(probeResult.format.duration);

    await this.ffmpegJobRunner.run({
      name: 'video-thumbnail-frame-extraction',
      acceleration: { input, gpuFilters: true, videoEncoder: null },
      spawnOptions: { cwd: targetDirectory, logVerbosity: 'warning' },

      buildArgs: (accel) => VideoThumbnailFrameExtractor.buildArgs(accel, input, seekPosition),

      awaitOutcome: async (handle) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Thumbnail extraction failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }

        if ((await this.listExtractedFrames(targetDirectory)).length === 0) {
          throw new Error(`Thumbnail extraction produced no frames:\n${handle.getLogProblems()}`);
        }
      },

      discardOutput: () => this.discardExtractedFrames(targetDirectory),
    });

    return this.listExtractedFrames(targetDirectory);
  }

  static buildArgs(accel: Accel, input: FfmpegVideoInput, seekPosition: number): string[] {
    return [
      ...accel.inputArgs(),
      '-ss', seekPosition.toFixed(2),

      '-i', input.path,
      '-map', '0:V:0',  // first 'real' video stream (explicitly excluding attached images etc.)

      '-map_metadata', '-1',
      '-fps_mode', 'vfr',

      '-vf', [
        accel.scale(ImageFileConstants.THUMBNAIL_WIDTH, -2),
        ...accel.download(),
        `thumbnail=n=${VideoThumbnailFrameExtractor.FRAMES_PER_SAMPLE}`,
      ].join(','),

      '-frames:v', VideoThumbnailFrameExtractor.SAMPLE_SIZE.toString(),

      '-c:v', 'png',
      '-compression_level', '0',
      `${VideoThumbnailFrameExtractor.FRAME_FILE_PREFIX}%03d.png`,
    ];
  }

  private async listExtractedFrames(targetDirectory: string): Promise<string[]> {
    const fileNames = await Fs.promises.readdir(targetDirectory);

    return fileNames
      .filter((fileName) => fileName.startsWith(VideoThumbnailFrameExtractor.FRAME_FILE_PREFIX))
      .sort()
      .map((fileName) => Path.join(targetDirectory, fileName));
  }

  private async discardExtractedFrames(targetDirectory: string): Promise<void> {
    const fileNames = await Fs.promises.readdir(targetDirectory);

    await Promise.all(fileNames
      .filter((fileName) => fileName.startsWith(VideoThumbnailFrameExtractor.FRAME_FILE_PREFIX))
      .map((fileName) => Fs.promises.rm(Path.join(targetDirectory, fileName), { force: true })));
  }

  private static determineSeekPosition(duration: string | undefined): number {
    const durationInSeconds = parseInt(duration ?? '0', 10);

    if (durationInSeconds <= VideoThumbnailFrameExtractor.SHORTEST_VIDEO_WORTH_SEEKING_IN) {
      return 0;
    }
    return durationInSeconds * VideoThumbnailFrameExtractor.SEEK_FRACTION;
  }
}
