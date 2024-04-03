import AbstractUser from '../../AbstractUser';
import { getPrismaClient } from '../../Constants';
import IUserFileSystem from '../filesystems/IUserFileSystem';
import IUserFile from '../IUserFile';
import PostgresFileIndex from './PostgresFileIndex';

export default abstract class FileIndex {
  private static instance: FileIndex | null;

  abstract search(startDir: IUserFile, query: string): Promise<IUserFile[]>;

  abstract refreshIndex(file: IUserFile, recursive: boolean, forceUpdate?: boolean): Promise<void>;

  abstract deleteIndex(file: IUserFile): Promise<void>;

  abstract renameIndex(src: IUserFile, dest: IUserFile): Promise<void>;

  abstract clearIndex(user: AbstractUser, fileSystem?: IUserFileSystem): Promise<void>;

  static getInstance(): FileIndex | null {
    if (this.instance === undefined) {
      if (getPrismaClient() != null) {
        this.instance = new PostgresFileIndex();
      }
    }

    return this.instance;
  }
}
