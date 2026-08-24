import Fs from 'node:fs';
import Path from 'node:path';
import type { Sharp } from 'sharp';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import ApolloTemporaryDirectory from '../../../../../files/temporary/ApolloTemporaryDirectory.js';
import FfmpegJobRunner from '../../../ffmpeg/job/FfmpegJobRunner.js';
import CachedFfprobeExecutor from '../../../ffmpeg/probe/CachedFfprobeExecutor.js';
import BestVideoThumbnailFrameSelector from './BestVideoThumbnailFrameSelector.js';

@singleton()
export default class VideoThumbnailFrameExtractor {
  private static readonly THUMBNAIL_WIDTH = 640;
  private static readonly THUMBNAIL_HEIGHT = 360;
  private static readonly SAMPLE_SIZE = 5;
  private static readonly SEEK_FRACTION = 0.2;
  private static readonly FRAMES_PER_SAMPLE = 100;

  constructor(
    private readonly apolloTemporaryDirectory: ApolloTemporaryDirectory,
    private readonly bestVideoThumbnailFrameDetector: BestVideoThumbnailFrameSelector,
    private readonly ffprobeExecutor: CachedFfprobeExecutor,
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  async extractThumbnailFrame(file: LocalFile): Promise<Sharp> {
    const videoDurationInSecondsPromise = this.determineVideoDurationInSeconds(file);

    return this.apolloTemporaryDirectory.createScoped(async (tmpDir) => {
      const videoDurationInSeconds = await videoDurationInSecondsPromise;
      const durationToSeekTo = videoDurationInSeconds <= 30 ? 0 : videoDurationInSeconds * VideoThumbnailFrameExtractor.SEEK_FRACTION;

      await this.runFrameExtraction(durationToSeekTo, file.getAbsolutePathOnHost(), tmpDir);

      const bestFrame = await this.bestVideoThumbnailFrameDetector.determineBestFrame(tmpDir);
      return bestFrame
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .resize({
          width: VideoThumbnailFrameExtractor.THUMBNAIL_WIDTH,
          height: VideoThumbnailFrameExtractor.THUMBNAIL_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        });
    });
  }

  private async runFrameExtraction(durationToSeekTo: number, filePath: string, cwd: string): Promise<void> {
    await this.ffmpegJobRunner.run({
      name: 'video-thumbnail-frame-extraction',
      acceleration: { mayUseHardwareDecoding: true },
      spawnOptions: { cwd, logVerbosity: 'warning' },

      buildArgs: (profile) => [
        ...(profile.decodeAcceleration != null ? ['-hwaccel', profile.decodeAcceleration] : []),

        '-ss', durationToSeekTo.toFixed(2),

        '-i', filePath,
        '-map', '0:V:0',  // first 'real' video stream; ignoring all other streams (audio etc.)

        '-map_metadata', '-1',
        // Load-bearing next to 'thumbnail': that filter emits one frame per batch, and the image sequence muxer
        // pads the gaps back to a constant rate, writing five copies of the first frame instead of five candidates
        '-fps_mode', 'vfr',
        '-t', (5 * 60).toString(),  // Limit analyze to a maximum of 5 minutes of video

        // 'thumbnail' hands us the most representative frame out of every batch of consecutive frames, judged by how
        // close its histogram is to that batch's average. Fades, flashes and cross-dissolves are the outliers of
        // their batch and lose without us having to guess a threshold for what "too dark" means.
        '-vf', `scale=${VideoThumbnailFrameExtractor.THUMBNAIL_WIDTH}:-2,thumbnail=n=${VideoThumbnailFrameExtractor.FRAMES_PER_SAMPLE}`,

        '-frames:v', VideoThumbnailFrameExtractor.SAMPLE_SIZE.toString(),

        '-c:v', 'png',
        '-compression_level', '0',
        'frame_%03d.png',
      ],

      awaitOutcome: async (handle) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Thumbnail extraction failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
        }

        // A decoder that exits cleanly without handing us a single frame is worth retrying without its hardware,
        // so this has to fail the attempt instead of leaving an empty directory behind
        if ((await Fs.promises.readdir(cwd)).length === 0) {
          throw new Error(`Thumbnail extraction produced no frames:\n${handle.getLogProblems()}`);
        }
      },

      discardOutput: () => this.discardExtractedFrames(cwd),
    });
  }

  private async discardExtractedFrames(cwd: string): Promise<void> {
    const fileNames = await Fs.promises.readdir(cwd);

    await Promise.all(fileNames
      .filter((fileName) => fileName.startsWith('frame_'))
      .map((fileName) => Fs.promises.rm(Path.join(cwd, fileName), { force: true })));
  }

  private async determineVideoDurationInSeconds(file: LocalFile): Promise<number> {
    const videoAnalysis = await this.ffprobeExecutor.probeFormat(file);
    return parseInt(videoAnalysis.format.duration ?? '0', 10);
  }
}
