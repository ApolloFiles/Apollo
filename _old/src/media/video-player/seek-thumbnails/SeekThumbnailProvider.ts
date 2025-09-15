import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import type LocalFile from '../../../user/files/local/LocalFile';
import SeekThumbnailCache from './SeekThumbnailCache';
import SeekThumbnailGenerator from './generator/SeekThumbnailGenerator';
import WebVttSeekThumbnailGenerator from './generator/WebVttSeekThumbnailGenerator';

@singleton()
export default class SeekThumbnailProvider {
  constructor(
    private readonly seekThumbnailsGenerator: SeekThumbnailGenerator,
    private readonly webVttGenerator: WebVttSeekThumbnailGenerator,
    private readonly thumbnailCache: SeekThumbnailCache,
  ) {
  }

  async provideWebVtt(file: LocalFile, thumbnailUrlGenerator: (frameIndex: number) => string): Promise<string> {
    await this.generateThumbnailsIfNotExists(file);

    const thumbnailData = (await this.thumbnailCache.getCachedThumbnailData(file))!;
    return this.webVttGenerator.generate(
      thumbnailData.thumbnail.count,
      thumbnailData.thumbnail.size,
      SeekThumbnailGenerator.GRID_SIZE,
      thumbnailData.frameTimes,
      thumbnailUrlGenerator,
    );
  }

  async provideThumbnailImage(file: LocalFile, thumbnailIndex: number): Promise<Buffer | null> {
    await this.generateThumbnailsIfNotExists(file);
    return this.thumbnailCache.getCachedThumbnail(file, thumbnailIndex);
  }

  private async generateThumbnailsIfNotExists(file: LocalFile): Promise<void> {
    if (await this.thumbnailCache.has(file)) {
      return;
    }

    const tmpDir = await file.fileSystem.owner.getTmpFileSystem().createTmpDir('media-video-player-seek-thumbnails-');
    try {
      await this.generateThumbnails(file, tmpDir.getAbsolutePathOnHost());
    } finally {
      await Fs.promises.rm(tmpDir.getAbsolutePathOnHost(), { recursive: true });
    }
  }

  private async generateThumbnails(videoFile: LocalFile, targetDirPath: string): Promise<void> {
    const generatedThumbnails = await this.seekThumbnailsGenerator.generate(videoFile.getAbsolutePathOnHost(), targetDirPath);
    await this.thumbnailCache.write(videoFile, generatedThumbnails);
  }
}
