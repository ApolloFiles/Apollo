import AbstractUser from '../../AbstractUser';
import { getSqlDatabase } from '../../Constants';
import PostgresDatabase from '../../database/postgres/PostgresDatabase';
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
      if (getSqlDatabase() != null) {
        if (getSqlDatabase() instanceof PostgresDatabase) {
          this.instance = new PostgresFileIndex();
        } else {
          throw new Error('Unsupported database type: ' + getSqlDatabase()?.constructor.name);
        }
      }
    }

    return this.instance;
  }
}
