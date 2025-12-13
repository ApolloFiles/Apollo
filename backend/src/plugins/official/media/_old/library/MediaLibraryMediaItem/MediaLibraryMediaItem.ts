import ApolloFileURI from '../../../../../../url/ApolloFileURI.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import type BaseModel from '../BaseModel.js';
import MediaLibrary from '../MediaLibrary/MediaLibrary.js';

export type MediaLibraryMediaItemInput = {
  id: bigint;
  mediaId: bigint;
  relativeFilePath: string;
  title: string;
  durationInSec: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  synopsis: string | null;
  media: {
    directoryUri: string;
    library: {
      id: bigint;
      ownerId: string;
      MediaLibrarySharedWith: {
        userId: string;
      }[];
    }
  }
};

export default class MediaLibraryMediaItem implements BaseModel {
  private constructor(
    public readonly id: bigint,
    public readonly libraryMediaId: bigint,
    public readonly relativeFilePath: string,
    public readonly title: string,
    public readonly durationInSeconds: number,
    public readonly seasonNumber: number | null,
    public readonly episodeNumber: number | null,
    public readonly synopsis: string | null,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: string,
    public readonly librarySharedWithUserIds: string[],
    public readonly mediaBaseDir: ApolloFileURI,
  ) {
  }

  canRead(user: ApolloUser | null): boolean {
    return MediaLibrary.canUserRead({
      ownerId: this.libraryOwnerId,
      sharedWithUserIds: this.librarySharedWithUserIds,
    }, user);
  }

  canWrite(user: ApolloUser | null): boolean {
    return MediaLibrary.canUserWrite({
      ownerId: this.libraryOwnerId,
      sharedWithUserIds: this.librarySharedWithUserIds,
    }, user);
  }

  static create(data: MediaLibraryMediaItemInput): MediaLibraryMediaItem {
    return new MediaLibraryMediaItem(
      data.id,
      data.mediaId,
      data.relativeFilePath,
      data.title,
      data.durationInSec,
      data.seasonNumber,
      data.episodeNumber,
      data.synopsis,
      data.media.library.id,
      data.media.library.ownerId,
      data.media.library.MediaLibrarySharedWith.map(v => v.userId),
      ApolloFileURI.parse(data.media.directoryUri),
    );
  }
}
