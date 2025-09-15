import type BaseModel from '../../../database/BaseModel';
import type ApolloUser from '../../../user/ApolloUser';
import MediaLibrary from '../MediaLibrary/MediaLibrary';

export type MediaLibraryMediaItemInput = {
  id: bigint;
  mediaId: bigint;
  filePath: string;
  title: string;
  durationInSec: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  synopsis: string | null;
  media: {
    library: {
      id: bigint;
      ownerId: bigint;
      MediaLibrarySharedWith: {
        userId: bigint;
      }[];
    }
  }
};

export default class MediaLibraryMediaItem implements BaseModel {
  private constructor(
    public readonly id: bigint,
    public readonly libraryMediaId: bigint,
    public readonly filePath: string,
    public readonly title: string,
    public readonly durationInSeconds: number,
    public readonly seasonNumber: number | null,
    public readonly episodeNumber: number | null,
    public readonly synopsis: string | null,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: bigint,
    public readonly librarySharedWithUserIds: bigint[],
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
      data.filePath,
      data.title,
      data.durationInSec,
      data.seasonNumber,
      data.episodeNumber,
      data.synopsis,
      data.media.library.id,
      data.media.library.ownerId,
      data.media.library.MediaLibrarySharedWith.map(v => v.userId),
    );
  }
}
