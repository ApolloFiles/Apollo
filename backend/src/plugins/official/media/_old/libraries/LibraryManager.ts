import { container } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import LocalFileSystem from '../../../../../files/local/LocalFileSystem.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import UserProvider from '../../../../../user/UserProvider.js';
import Library from './Library.js';

export default class LibraryManager {
  private readonly user: ApolloUser;

  constructor(user: ApolloUser) {
    this.user = user;
  }

  async getLibrary(libraryId: string): Promise<Library | null> {
    const library = await container.resolve(DatabaseClient).mediaLibrary.findUnique({
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
      user = await container.resolve(UserProvider).provideByAuthId(library.ownerId);
    }
    if (user == null) {
      throw new Error('Library is owned by a user that does not exist');
    }

    return new Library(
      user,
      library.id.toString(),
      library.name,
      library.MediaLibrarySharedWith.map(v => Number(v.userId)),
      await this.mapLibraryPathToUserFile(library.directoryPaths),
    );
  }

  async getLibraries(): Promise<Library[]> {
    const libraries = await container.resolve(DatabaseClient).mediaLibrary.findMany({
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
        user = await container.resolve(UserProvider).provideByAuthId(library.ownerId);
      }
      if (user == null) {
        throw new Error('Library is owned by a user that does not exist');
      }

      result.push(new Library(
        user,
        library.id.toString(),
        library.name, library.MediaLibrarySharedWith.map(v => Number(v.userId)),
        await this.mapLibraryPathToUserFile(library.directoryPaths),
      ));
    }

    return result;
  }

  private async mapLibraryPathToUserFile(paths: string[]): Promise<LocalFile[]> {
    const fileSystems = await container.resolve(FileSystemProvider).provideForUser(this.user);
    const defaultFileSystem = fileSystems.user[0];
    if (!(defaultFileSystem instanceof LocalFileSystem)) {
      throw new Error('Default user file system is not a LocalFileSystem');
    }

    const mappedPaths: LocalFile[] = [];
    for (const path of paths) {
      mappedPaths.push(await defaultFileSystem.getFile(path));
    }
    return mappedPaths;
  }
}
