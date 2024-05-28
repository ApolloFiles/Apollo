import AbstractUser from '../../AbstractUser';
import { getPrismaClient } from '../../Constants';
import IUserFile from '../../files/IUserFile';
import UserStorage from '../../UserStorage';
import Library from './Library';

export default class LibraryManager {
  private readonly user: AbstractUser;

  constructor(user: AbstractUser) {
    this.user = user;
  }

  async getLibrary(libraryId: string): Promise<Library | null> {
    const library = await getPrismaClient()!.mediaLibrary.findUnique({
      where: {
        id: BigInt(libraryId),
        OR: [
          {
            ownerId: BigInt(this.user.getId())
          },
          {
            MediaLibrarySharedWith: {
              some: { userId: BigInt(this.user.getId()) }
            }
          }
        ]
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryPaths: true,
        MediaLibrarySharedWith: {
          select: {
            userId: true
          }
        }
      }
    });
    if (library == null) {
      return null;
    }

    let user: AbstractUser | null = this.user;
    if (library.ownerId !== BigInt(this.user.getId())) {
      user = await new UserStorage().getUser(Number(library.ownerId));
    }
    if (user == null) {
      throw new Error('Library is owned by a user that does not exist');
    }

    return new Library(
      user,
      library.id.toString(),
      library.name,
      library.MediaLibrarySharedWith.map(v => Number(v.userId)),
      this.mapLibraryPathToUserFile(library.directoryPaths)
    );
  }

  async getLibraries(): Promise<Library[]> {
    const libraries = await getPrismaClient()!.mediaLibrary.findMany({
      where: {
        OR: [
          {
            ownerId: BigInt(this.user.getId())
          },
          {
            MediaLibrarySharedWith: {
              some: { userId: BigInt(this.user.getId()) }
            }
          }
        ]
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryPaths: true,
        MediaLibrarySharedWith: {
          select: {
            userId: true
          }
        }
      }
    });

    const result: Library[] = [];
    for (const library of libraries) {
      let user: AbstractUser | null = this.user;
      if (library.ownerId !== BigInt(this.user.getId())) {
        user = await new UserStorage().getUser(Number(library.ownerId));
      }
      if (user == null) {
        throw new Error('Library is owned by a user that does not exist');
      }

      result.push(new Library(
        user,
        library.id.toString(),
        library.name, library.MediaLibrarySharedWith.map(v => Number(v.userId)),
        this.mapLibraryPathToUserFile(library.directoryPaths)
      ));
    }

    return result;
  }

  private mapLibraryPathToUserFile(paths: string[]): IUserFile[] {
    return paths.map(path => this.user.getDefaultFileSystem().getFile(path));
  }
}
