import Path from 'node:path';
import { singleton } from 'tsyringe';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import FfprobeExecutor from '../../../ffmpeg/FfprobeExecutor.js';
import type MediaLibrary from '../database/MediaLibrary.js';
import AbstractScanner from './AbstractScanner.js';
import type MediaLibraryMediaWriter from './MediaLibraryMediaWriter.js';

@singleton()
export default class MovieDirectoryScanner extends AbstractScanner {
  constructor(
    private readonly ffprobeExecutor: FfprobeExecutor,
  ) {
    super();
  }

  async scan(library: MediaLibrary, mediaDirectory: VirtualFile, writer: MediaLibraryMediaWriter): Promise<void> {
    const mediaInfo = this.extractInfoFromMediaDirectoryName(mediaDirectory);

    // TODO: It might make sense to 'overtake' other existing media here, in case the directory got renamed or so (and the other media directory no longer exists)
    const mediaId = await writer.createIfNotExists(library.id, mediaDirectory.toURI().toString(), mediaInfo.title);

    for (const file of (await mediaDirectory.getFiles())) {
      if (await file.isDirectory()) {
        continue;
      }

      if (this.looksLikeMovieFile(mediaDirectory, file)) {
        await this.processMovieFile(writer, mediaId, mediaDirectory, file, mediaInfo.title);
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
    fallbackTitle: string,
  ): Promise<void> {
    let title = fallbackTitle;
    let synopsis: string | null = null;
    let durationInSec = 0;

    if (file instanceof LocalFile) {
      const fileProbe = await this.ffprobeExecutor.probe(file.getAbsolutePathOnHost(), true);
      durationInSec = Math.ceil(parseInt(fileProbe.format.duration ?? '0', 10));

      const extractedTitle = this.extractMetadataFromProbe(fileProbe, 'title');
      if (extractedTitle != null && extractedTitle.trim().length > 0) {
        title = extractedTitle.trim();
      }

      const extractedSynopsis = this.extractMetadataFromProbe(fileProbe, 'synopsis');
      if (extractedSynopsis != null && extractedSynopsis.trim().length > 0) {
        synopsis = extractedSynopsis.trim();
      }
    } else {
      console.error(
        '[ERROR] Cannot probe file duration for non-local files during media library scan:',
        file.toURI().toString(),
      );
    }

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
