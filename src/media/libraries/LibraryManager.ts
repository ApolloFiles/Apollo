import AbstractUser from '../../AbstractUser';
import { getPrismaClient } from '../../Constants';
import IUserFile from '../../files/IUserFile';
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
        ownerId: BigInt(this.user.getId())
      }
    });
    if (library == null) {
      return null;
    }

    return new Library(this.user, library.id.toString(), library.name, this.mapLibraryPathToUserFile(library.directoryPaths));
  }

  async getLibraries(): Promise<Library[]> {
    const libraries = await getPrismaClient()!.mediaLibrary.findMany({
      where: {
        ownerId: BigInt(this.user.getId())
      }
    });

    return libraries.map(library => {
      return new Library(this.user, library.id.toString(), library.name, this.mapLibraryPathToUserFile(library.directoryPaths));
    });
  }

  private mapLibraryPathToUserFile(paths: string[]): IUserFile[] {
    return paths.map(path => this.user.getDefaultFileSystem().getFile(path));
  }
}
