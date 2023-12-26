import AbstractUser from '../../AbstractUser';
import MediaLibraryTable, { LibraryMedia, LibraryTitle } from '../../database/postgres/MediaLibraryTable';
import IUserFile from '../../files/IUserFile';

export default class Library {
  readonly owner: AbstractUser;
  readonly id: string;
  readonly name: string;

  readonly directories: IUserFile[];

  constructor(owner: AbstractUser, id: string, name: string, directories: IUserFile[]) {
    this.owner = owner;
    this.id = id;
    this.name = name;
    this.directories = directories;
  }

  fetchTitles(): Promise<LibraryTitle[]> {
    return MediaLibraryTable.getInstance().getLibraryTitlesOrderedRecentFirst(this.id);
  }

  fetchTitle(titleId: string): Promise<LibraryTitle | null> {
    return MediaLibraryTable.getInstance().getLibraryTitle(this.id, titleId);
  }

  fetchMedia(titleId: string, mediaFilePath: string): Promise<LibraryMedia | null> {
    return MediaLibraryTable.getInstance().getLibraryMedia(this.id, titleId, mediaFilePath);
  }
}
