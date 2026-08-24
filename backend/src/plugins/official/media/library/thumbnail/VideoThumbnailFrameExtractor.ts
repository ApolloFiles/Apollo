import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import FfmpegJobRunner from '../../../ffmpeg/job/FfmpegJobRunner.js';
import CachedFfprobeExecutor from '../../../ffmpeg/probe/CachedFfprobeExecutor.js';
import ImageFileConstants from '../images/ImageFileConstants.js';

@singleton()
export default class VideoThumbnailFrameExtractor {
  private static readonly FRAME_FILE_PREFIX = 'frame_';

  private static readonly SAMPLE_SIZE = 5;
  private static readonly FRAMES_PER_SAMPLE = 100;
  private static readonly SEEK_FRACTION = 0.2;
  private static readonly MAX_ANALYZED_SECONDS = 5 * 60;
  private static readonly SHORTEST_VIDEO_WORTH_SEEKING_IN = 30;

  constructor(
    private readonly ffprobeExecutor: CachedFfprobeExecutor,
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extractCandidateFrames(file: LocalFile, targetDirectory: string): Promise<string[]> {
    const seekPosition = await this.determineSeekPosition(file);

    await this.ffmpegJobRunner.run({
      name: 'video-thumbnail-frame-extraction',
      acceleration: { mayUseHardwareDecoding: true },
      spawnOptions: { cwd: targetDirectory, logVerbosity: 'warning' },

      buildArgs: (profile) => [
        ...(profile.decodeAcceleration != null ? ['-hwaccel', profile.decodeAcceleration] : []),

        '-ss', seekPosition.toFixed(2),

        '-i', file.getAbsolutePathOnHost(),
        '-map', '0:V:0',  // first 'real' video stream; ignoring all other streams (audio etc.)

        '-map_metadata', '-1',
        // Load-bearing next to 'thumbnail': that filter emits one frame per batch, and the image sequence muxer
        // pads the gaps back to a constant rate, writing five copies of the first frame instead of five candidates
        '-fps_mode', 'vfr',
        '-t', VideoThumbnailFrameExtractor.MAX_ANALYZED_SECONDS.toString(),

        // 'thumbnail' hands us the most representative frame out of every batch of consecutive frames, judged by how
        // close its histogram is to that batch's average. Fades, flashes and cross-dissolves are the outliers of
        // their batch and lose without us having to guess a threshold for what "too dark" means.
        '-vf', `scale=${ImageFileConstants.THUMBNAIL_WIDTH}:-2,thumbnail=n=${VideoThumbnailFrameExtractor.FRAMES_PER_SAMPLE}`,

        '-frames:v', VideoThumbnailFrameExtractor.SAMPLE_SIZE.toString(),

        '-c:v', 'png',
        '-compression_level', '0',
        `${VideoThumbnailFrameExtractor.FRAME_FILE_PREFIX}%03d.png`,
      ],

      awaitOutcome: async (handle) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Thumbnail extraction failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }

        // A decoder that exits cleanly without handing us a single frame is worth retrying without its hardware,
        // so this has to fail the attempt instead of leaving an empty directory behind
        if ((await Fs.promises.readdir(targetDirectory)).length === 0) {
          throw new Error(`Thumbnail extraction produced no frames:\n${handle.getLogProblems()}`);
        }
      },

      discardOutput: () => this.discardExtractedFrames(targetDirectory),
    });

    return this.listExtractedFrames(targetDirectory);
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

  private async determineSeekPosition(file: LocalFile): Promise<number> {
    const videoAnalysis = await this.ffprobeExecutor.probeFormat(file);
    const durationInSeconds = parseInt(videoAnalysis.format.duration ?? '0', 10);

    if (durationInSeconds <= VideoThumbnailFrameExtractor.SHORTEST_VIDEO_WORTH_SEEKING_IN) {
      return 0;
    }
    return durationInSeconds * VideoThumbnailFrameExtractor.SEEK_FRACTION;
  }
}
