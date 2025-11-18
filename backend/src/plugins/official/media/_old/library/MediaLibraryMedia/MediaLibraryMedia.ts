import type ApolloUser from '../../../../../../user/ApolloUser.js';
import type BaseModel from '../BaseModel.js';
import MediaLibrary from '../MediaLibrary/MediaLibrary.js';

export type MediaLibraryMediaInput = {
  id: bigint;
  libraryId: bigint;
  title: string;
  synopsis: string | null;
  library: {
    ownerId: string;
    MediaLibrarySharedWith: {
      userId: string;
    }[];
  },
};

export default class MediaLibraryMedia implements BaseModel {
  private constructor(
    public readonly id: bigint,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: string,
    public readonly librarySharedWithUserIds: string[],
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
