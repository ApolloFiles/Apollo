import { container } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type * as PrismaClient from '../../../../../database/prisma-client/client.js';
import type { MediaLibraryFindManyArgs } from '../../../../../database/prisma-client/models.js';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import PermissionAwareFileProvider from '../../../../../files/provider/PermissionAwareFileProvider.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import ApolloFileURI from '../../../../../uri/ApolloFileURI.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import UserProvider from '../../../../../user/UserProvider.js';
import Library from './Library.js';

/**
 * @deprecated
 */
export default class LibraryManager {
  private readonly user: ApolloUser;

  private readonly databaseClient = container.resolve(DatabaseClient);
  private readonly userProvider = container.resolve(UserProvider);
  private readonly fileProvider = container.resolve(PermissionAwareFileProvider);

  private readonly FILTER_LIBRARY_FOR_USER: MediaLibraryFindManyArgs['where'];

  constructor(user: ApolloUser) {
    this.user = user;

    this.FILTER_LIBRARY_FOR_USER = {
      OR: [
        {
          ownerId: this.user.id,
        },
        {
          MediaLibrarySharedWith: {
            some: { userId: this.user.id },
          },
        },
      ],
    };
  }

  async getLibrary(libraryId: string): Promise<Library | null> {
    const library = await this.databaseClient.mediaLibrary.findUnique({
      where: {
        ...this.FILTER_LIBRARY_FOR_USER,
        id: BigInt(libraryId),
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
        MediaLibrarySharedWith: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (library == null) {
      return null;
    }

    let user: ApolloUser | null = this.user;
    if (library.ownerId !== this.user.id) {
      user = await this.userProvider.findById(library.ownerId);
    }
    if (user == null) {
      throw new Error('Library is owned by a user that does not exist');
    }

    return new Library(
      user,
      library.id.toString(),
      library.name,
      library.MediaLibrarySharedWith.map(v => Number(v.userId)),
      await this.mapLibraryPathUrisToUserFile(library.directoryUris),
    );
  }

  async fetchMediaSortedByRecentlyAdded(libraryId: bigint): Promise<PrismaClient.MediaLibraryMedia[]> {
    const libraryIdsUserHasAccessTo = await this.findLibraryIds();
    if (libraryId != null && !libraryIdsUserHasAccessTo.includes(libraryId)) {
      console.warn(`[WARN] 'Recently added' requested for a library the user has no access to`);
      return [];
    }

    return this.databaseClient.mediaLibraryMedia.findMany({
      where: { libraryId },
      orderBy: { addedAt: 'desc' },
    });
  }

  async fetchMediaSortedAlphabetically(libraryId: bigint): Promise<PrismaClient.MediaLibraryMedia[]> {
    const libraryIdsUserHasAccessTo = await this.findLibraryIds();
    if (libraryId != null && !libraryIdsUserHasAccessTo.includes(libraryId)) {
      console.warn(`[WARN] 'Recently added' requested for a library the user has no access to`);
      return [];
    }

    return this.databaseClient.mediaLibraryMedia.findMany({
      where: { libraryId },
      orderBy: { title: 'asc' },
    });
  }

  async fetchRecentlyAddedMediaExcludingSome(librariesToExclude: bigint[], limit = 12): Promise<PrismaClient.MediaLibraryMedia[]> {
    const libraryIdsUserHasAccessTo = await this.findLibraryIds();

    return this.databaseClient.mediaLibraryMedia.findMany({
      where: {
        libraryId: {
          in: libraryIdsUserHasAccessTo,
          notIn: librariesToExclude,
        },
      },
      orderBy: {
        addedAt: 'desc',
      },
      take: limit,
    });
  }

  async findLibraryIds(): Promise<bigint[]> {
    return (await this.databaseClient.mediaLibrary.findMany({
      where: this.FILTER_LIBRARY_FOR_USER,
      select: {
        id: true,
      },
    }))
      .map(library => library.id);
  }

  private async mapLibraryPathUrisToUserFile(uris: string[]): Promise<LocalFile[]> {
    const files: VirtualFile[] = [];

    for (const uri of uris) {
      files.push(await this.fileProvider.provideForMediaContextRead(ApolloFileURI.parse(uri), this.user));
    }

    return files as LocalFile[];
  }
}
