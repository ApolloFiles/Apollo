import Path from 'node:path';
import { singleton } from 'tsyringe';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import FfprobeExecutor from '../../../ffmpeg/FfprobeExecutor.js';
import FileTypeUtils from '../../_old/FileTypeUtils.js';
import type ReadContentsLibrary from '../database/library/ReadContentsLibrary.js';
import AbstractScanner, { type MediaDirectoryInfo } from './AbstractScanner.js';
import type MediaLibraryMediaWriter from './MediaLibraryMediaWriter.js';

@singleton()
export default class MovieDirectoryScanner extends AbstractScanner {
  constructor(
    ffprobeExecutor: FfprobeExecutor,
    private readonly fileTypeUtils: FileTypeUtils,
  ) {
    super(ffprobeExecutor);
  }

  async scan(library: ReadContentsLibrary, mediaDirectory: VirtualFile, writer: MediaLibraryMediaWriter): Promise<void> {
    const mediaInfo = this.extractInfoFromMediaDirectoryName(mediaDirectory);

    // TODO: It might make sense to 'overtake' other existing media here, in case the directory got renamed or so (and the other media directory no longer exists)
    const mediaId = await writer.createIfNotExists(library.id, mediaDirectory.toURI().toString(), mediaInfo.title);

    for (const file of (await mediaDirectory.getFiles())) {
      if (await file.isDirectory()) {
        continue;
      }

      if (this.looksLikeMovieFile(mediaDirectory, file)) {
        await this.processMovieFile(writer, mediaId, mediaDirectory, file, mediaInfo);
        break;
      }
    }
  }

  // TODO: Maybe move this 'helper' method used by the Detector into another shared class?
  looksLikeMovieFile(mediaDirectory: VirtualFile, file: VirtualFile): boolean {
    const directoryName = mediaDirectory.getFileName().trim();
    const fileName = file.getFileName().trim();
    const fileNameWithoutExtension = Path.basename(fileName, Path.extname(fileName)).trim();

    return directoryName.includes(fileNameWithoutExtension) || /^Movie\..*$/i.test(fileName);
  }

  private async processMovieFile(
    writer: MediaLibraryMediaWriter,
    mediaId: bigint,
    mediaDirectory: VirtualFile,
    file: VirtualFile,
    mediaInfo: MediaDirectoryInfo,
  ): Promise<void> {
    // FIXME: this should also work for non-local files
    if (file instanceof LocalFile) {
      const mimeType = await this.fileTypeUtils.getMimeTypeTrustExtension(file.getAbsolutePathOnHost());
      if (mimeType != null && !mimeType.startsWith('video/')) {
        return;
      }
    }

    const {
      title,
      synopsis,
      durationInSec,
      externalIds,
    } = await this.extractCommonVideoMetadata(file, mediaInfo.title);

    await writer.updateExternalIds(mediaId, {
      ...externalIds,
      ...mediaInfo.externalIds,
    });

    await writer.createMediaItemIfNotExist(
      mediaId,
      this.getRelativeFilePath(mediaDirectory, file),
      title,
      durationInSec,
      synopsis,
      null,
      null,
    );
  }
}
