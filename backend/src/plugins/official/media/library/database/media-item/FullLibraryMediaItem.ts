import ApolloFileURI from '../../../../../../uri/ApolloFileURI.js';
import ReadContentsLibraryMediaItem from './ReadContentsLibraryMediaItem.js';

export default class FullLibraryMediaItem extends ReadContentsLibraryMediaItem {
  /**
   * @internal
   */
  constructor(
    id: bigint,
    title: string,
    synopsis: string | null,
    addedAt: Date,
    durationInSec: number,
    episodeNumber: number | null,
    seasonNumber: number | null,
    mediaId: bigint,
    libraryId: bigint,
    libraryOwnerId: string,
    public readonly relativeFilePath: string,
    public readonly mediaBaseDirectoryUri: ApolloFileURI,
  ) {
    super(id, title, synopsis, addedAt, durationInSec, episodeNumber, seasonNumber, mediaId, libraryId, libraryOwnerId);
  }

  /**
   * @internal
   */
  public static fromData(data: {
    id: bigint,
    title: string,
    synopsis: string | null,
    addedAt: Date,
    durationInSec: number,
    episodeNumber: number | null,
    seasonNumber: number | null,

    relativeFilePath: string,
    media: {
      id: bigint,
      directoryUri: string,
      library: {
        id: bigint,
        ownerId: string,
      },
    },
  }): FullLibraryMediaItem {
    return new FullLibraryMediaItem(
      data.id,
      data.title,
      data.synopsis,
      data.addedAt,
      data.durationInSec,
      data.episodeNumber,
      data.seasonNumber,

      data.media.id,
      data.media.library.id,
      data.media.library.ownerId,

      data.relativeFilePath,
      ApolloFileURI.parse(data.media.directoryUri),
    );
  }
}
