import AbstractUser from '../../AbstractUser';
import MediaLibraryTable from '../../database/postgres/MediaLibraryTable';
import Library from './Library';

export default class LibraryManager {
  private readonly user: AbstractUser;

  constructor(user: AbstractUser) {
    this.user = user;
  }

  getLibrary(libraryId: string): Promise<Library | null> {
    return MediaLibraryTable.getInstance().getLibrary(this.user, libraryId);
  }

  getLibraries(): Promise<Library[]> {
    return MediaLibraryTable.getInstance().getLibraries(this.user);
  }
}
