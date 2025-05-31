import type BaseModel from '../../../database/BaseModel';
import type ApolloUser from '../../../user/ApolloUser';
import MediaLibrary from '../MediaLibrary/MediaLibrary';

export type MediaLibraryMediaInput = {
  id: bigint;
  libraryId: bigint;
  title: string;
  synopsis: string | null;
  library: {
    ownerId: bigint;
    MediaLibrarySharedWith: {
      userId: bigint;
    }[];
  },
};

export default class MediaLibraryMedia implements BaseModel {
  private constructor(
    public readonly id: bigint,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: bigint,
    public readonly librarySharedWithUserIds: bigint[],
    public readonly title: string,
    public readonly synopsis: string | null,
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

  static create(data: MediaLibraryMediaInput): MediaLibraryMedia {
    return new MediaLibraryMedia(
      data.id,
      data.libraryId,
      data.library.ownerId,
      data.library.MediaLibrarySharedWith.map(v => v.userId),
      data.title,
      data.synopsis,
    );
  }
}
