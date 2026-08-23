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
      const durationToSeekTo = videoDurationInSeconds <= 30 ? 0 : videoDurationInSeconds * 0.1;

      await this.runFrameExtraction(durationToSeekTo, file.getAbsolutePathOnHost(), tmpDir, false);

      if ((await Fs.promises.readdir(tmpDir)).length === 0) {
        await this.runFrameExtraction(durationToSeekTo, file.getAbsolutePathOnHost(), tmpDir, true);
      }

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

  private async runFrameExtraction(durationToSeekTo: number, filePath: string, cwd: string, favorGettingSomeResultOverPerformance: boolean): Promise<void> {
    let videoFilter = 'scale=' + VideoThumbnailFrameExtractor.THUMBNAIL_WIDTH + ':-2';
    if (!favorGettingSomeResultOverPerformance) {
      videoFilter += ',select=gt(scene\\,0.5)';
    }

    await this.ffmpegJobRunner.run({
      name: 'video-thumbnail-frame-extraction',
      acceleration: { mayUseHardwareDecoding: true },
      spawnOptions: { cwd, logVerbosity: 'warning' },

      buildArgs: (profile) => [
        ...(profile.decodeAcceleration != null ? ['-hwaccel', profile.decodeAcceleration] : []),

        ...(favorGettingSomeResultOverPerformance ? [] : [
          '-skip_frame', 'nokey',
          '-ss', durationToSeekTo.toFixed(2),
        ]),

        '-i', filePath,
        '-map', '0:V:0',  // first 'real' video stream; ignoring all other streams (audio etc.)

        '-map_metadata', '-1',
        '-fps_mode', 'vfr', // do not duplicate frames
        '-t', (5 * 60).toString(),  // Limit analyze to a maximum of 5 minutes of video

        '-vf', videoFilter,

        '-frames:v', VideoThumbnailFrameExtractor.SAMPLE_SIZE.toString(),

        '-c:v', 'png',
        '-compression_level', '0',
        'frame_%03d.png',
      ],

      // An empty output directory is a legitimate result here – the scene filter may simply not have matched
      awaitOutcome: async (handle) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`Thumbnail extraction failed because ffmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
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
