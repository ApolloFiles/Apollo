import type BaseModel from '../../../database/BaseModel';
import type ApolloUser from '../../../user/ApolloUser';

export type MediaLibraryInput = {
  id: bigint;
  ownerId: bigint;
  name: string;
  directoryPaths: string[];
  MediaLibrarySharedWith: {
    userId: bigint;
  }[];
};

export default class MediaLibrary implements BaseModel {
  private constructor(
    public readonly id: bigint,
    public readonly ownerId: bigint,
    public readonly name: string,
    public readonly directoryPaths: string[],
    public readonly sharedWithUserIds: bigint[],
  ) {
  }

  canRead(user: ApolloUser | null): boolean {
    return MediaLibrary.canUserRead(this, user);
  }

  canWrite(user: ApolloUser | null): boolean {
    return MediaLibrary.canUserWrite(this, user);
  }

  static canUserRead(library: Pick<MediaLibrary, 'ownerId' | 'sharedWithUserIds'>, user: ApolloUser | null): boolean {
    return user != null && (library.ownerId === user.id || library.sharedWithUserIds.includes(user.id));
  }

  static canUserWrite(library: Pick<MediaLibrary, 'ownerId' | 'sharedWithUserIds'>, user: ApolloUser | null): boolean {
    return user != null && library.ownerId === user.id;
  }

  static create(data: MediaLibraryInput): MediaLibrary {
    return new MediaLibrary(
      data.id,
      data.ownerId,
      data.name,
      data.directoryPaths,
      data.MediaLibrarySharedWith.map(v => v.userId),
    );
  }
}
