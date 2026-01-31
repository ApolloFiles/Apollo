import Fs from 'node:fs';
import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import ApolloTemporaryDirectory from '../../../../../files/temporary/ApolloTemporaryDirectory.js';
import BufferedChildProcess from '../../../../builtin/child_process/BufferedChildProcess.js';
import FfprobeExecutor from '../../../ffmpeg/FfprobeExecutor.js';
import BestVideoThumbnailFrameSelector from './BestVideoThumbnailFrameSelector.js';

@singleton()
export default class VideoThumbnailFrameExtractor {
  private static readonly THUMBNAIL_WIDTH = 640;
  private static readonly THUMBNAIL_HEIGHT = 360;
  private static readonly SAMPLE_SIZE = 5;

  constructor(
    private readonly apolloTemporaryDirectory: ApolloTemporaryDirectory,
    private readonly bestVideoThumbnailFrameDetector: BestVideoThumbnailFrameSelector,
    private readonly ffprobeExecutor: FfprobeExecutor,
  ) {
  }

  async extractThumbnailFrame(file: LocalFile): Promise<Sharp.Sharp> {
    const videoDurationInSecondsPromise = this.determineVideoDurationInSeconds(file.getAbsolutePathOnHost());

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
    const ffmpegProcess = await BufferedChildProcess.spawn('ffmpeg', [
        '-loglevel', 'warning',

        '-hwaccel', 'auto',

        ...(favorGettingSomeResultOverPerformance ? [] : [
          '-skip_frame', 'nokey',
          '-ss', durationToSeekTo.toFixed(2),
        ]),

        '-i', filePath,
        '-map', '0:V:0',  // first 'real' video stream; ignoring all other streams (audio etc.)

        '-map_metadata', '-1',
        '-fps_mode', 'vfr', // do not duplicate frames
        '-t', (5 * 60).toString(),  // Limit analyze to a maximum of 5 minutes of video

        '-vf', 'scale=' + VideoThumbnailFrameExtractor.THUMBNAIL_WIDTH + ':-2,select=gt(scene\\,0.5)',

        '-frames:v', VideoThumbnailFrameExtractor.SAMPLE_SIZE.toString(),

        '-c:v', 'png',
        '-compression_level', '0',
        'frame_%03d.png',
      ],
      { cwd },
    );

    if (ffmpegProcess.exitCode !== 0) {
      throw new Error(`Thumbnail extraction failed because ffmpeg exited with code ${ffmpegProcess.exitCode}: ${JSON.stringify({
        exitCode: ffmpegProcess.exitCode,
        signal: ffmpegProcess.signal,
        stdout: ffmpegProcess.stdout.toString(),
        stderr: ffmpegProcess.stderr.toString(),
      })}`);
    }
  }

  private async determineVideoDurationInSeconds(videoFilePath: string): Promise<number> {
    const videoAnalysis = await this.ffprobeExecutor.probe(videoFilePath);
    return parseInt(videoAnalysis.format.duration ?? '0', 10);
  }
}
