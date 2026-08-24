import type { Sharp } from 'sharp';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import ApolloTemporaryDirectory from '../../../../../files/temporary/ApolloTemporaryDirectory.js';
import ImageFileConstants from '../images/ImageFileConstants.js';
import VideoThumbnailFrameExtractor from './VideoThumbnailFrameExtractor.js';
import VideoThumbnailFrameSelector from './VideoThumbnailFrameSelector.js';

@singleton()
export default class VideoThumbnailGenerator {
  constructor(
    private readonly apolloTemporaryDirectory: ApolloTemporaryDirectory,
    private readonly videoThumbnailFrameExtractor: VideoThumbnailFrameExtractor,
    private readonly videoThumbnailFrameSelector: VideoThumbnailFrameSelector,
  ) {
  }

  async generate(file: LocalFile): Promise<Sharp> {
    return this.apolloTemporaryDirectory.createScoped(async (frameDirectory) => {
      const framePaths = await this.videoThumbnailFrameExtractor.extractCandidateFrames(file, frameDirectory);
      const frame = await this.videoThumbnailFrameSelector.selectBestFrame(framePaths);

      // The frame has been read into memory, so it outlives the directory this scope is about to delete
      return frame
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .resize({
          width: ImageFileConstants.THUMBNAIL_WIDTH,
          height: ImageFileConstants.THUMBNAIL_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        });
    });
  }
}
