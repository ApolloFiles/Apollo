import { getPrismaClient } from '../../Constants';
import ApolloUser from '../../user/ApolloUser';
import ApolloUserStorage from '../../user/ApolloUserStorage';
import LocalFile from '../../user/files/local/LocalFile';
import Library from './Library';

export default class LibraryManager {
  private readonly user: ApolloUser;

  constructor(user: ApolloUser) {
    this.user = user;
  }

  async getLibrary(libraryId: string): Promise<Library | null> {
    const library = await getPrismaClient()!.mediaLibrary.findUnique({
      where: {
        id: BigInt(libraryId),
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
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryPaths: true,
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
      user = await new ApolloUserStorage().findById(library.ownerId);
    }
    if (user == null) {
      throw new Error('Library is owned by a user that does not exist');
    }

    return new Library(
      user,
      library.id.toString(),
      library.name,
      library.MediaLibrarySharedWith.map(v => Number(v.userId)),
      this.mapLibraryPathToUserFile(library.directoryPaths),
    );
  }

  async getLibraries(): Promise<Library[]> {
    const libraries = await getPrismaClient()!.mediaLibrary.findMany({
      where: {
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
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryPaths: true,
        MediaLibrarySharedWith: {
          select: {
            userId: true,
          },
        },
      },
    });

    const result: Library[] = [];
    for (const library of libraries) {
      let user: ApolloUser | null = this.user;
      if (library.ownerId !== this.user.id) {
        user = await new ApolloUserStorage().findById(library.ownerId);
      }
      if (user == null) {
        throw new Error('Library is owned by a user that does not exist');
      }

      result.push(new Library(
        user,
        library.id.toString(),
        library.name, library.MediaLibrarySharedWith.map(v => Number(v.userId)),
        this.mapLibraryPathToUserFile(library.directoryPaths),
      ));
    }

    return result;
  }

  private mapLibraryPathToUserFile(paths: string[]): LocalFile[] {
    return paths.map(path => this.user.getDefaultFileSystem().getFile(path));
  }
}
