import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import ApolloTemporaryDirectory from '../../../../../files/temporary/ApolloTemporaryDirectory.js';
import BufferedChildProcess from '../../../../builtin/child_process/BufferedChildProcess.js';
import VideoAnalyser from '../../_old/video/analyser/VideoAnalyser.js';
import BestVideoThumbnailFrameSelector from './BestVideoThumbnailFrameSelector.js';

@singleton()
export default class VideoThumbnailFrameExtractor {
  private static readonly THUMBNAIL_WIDTH = 640;
  private static readonly THUMBNAIL_HEIGHT = 360;
  private static readonly SAMPLE_SIZE = 5;

  constructor(
    private readonly apolloTemporaryDirectory: ApolloTemporaryDirectory,
    private readonly bestVideoThumbnailFrameDetector: BestVideoThumbnailFrameSelector,
  ) {
  }

  async extractThumbnailFrame(file: LocalFile): Promise<Sharp.Sharp> {
    const videoDurationInSecondsPromise = this.determineVideoDurationInSeconds(file.getAbsolutePathOnHost());

    return this.apolloTemporaryDirectory.createScoped(async (tmpDir) => {
      const videoDurationInSeconds = await videoDurationInSecondsPromise;
      const durationToSeekTo = videoDurationInSeconds <= 30 ? 0 : videoDurationInSeconds * 0.1;

      const ffmpegProcess = await BufferedChildProcess.spawn('ffmpeg', [
          '-loglevel', 'warning',

          '-hwaccel', 'auto',

          '-skip_frame', 'nokey',
          '-ss', durationToSeekTo.toFixed(2),

          '-i', file.getAbsolutePathOnHost(),
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
        { cwd: tmpDir },
      );

      if (ffmpegProcess.exitCode !== 0) {
        throw new Error(`Thumbnail extraction failed because ffmpeg exited with code ${ffmpegProcess.exitCode}: ${JSON.stringify(ffmpegProcess)}`);
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

  private async determineVideoDurationInSeconds(videoFilePath: string): Promise<number> {
    const videoAnalysis = await VideoAnalyser.analyze(videoFilePath);
    return parseInt(videoAnalysis.file.duration ?? '0', 10);
  }
}
