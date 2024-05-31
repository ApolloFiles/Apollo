import { getPrismaClient } from '../../Constants';
import ApolloUser from '../../user/ApolloUser';
import VirtualFile from '../../user/files/VirtualFile';
import VirtualFileSystem from '../../user/files/VirtualFileSystem';
import PostgresFileIndex from './PostgresFileIndex';

export default abstract class FileIndex {
  private static instance: FileIndex | null;

  abstract search(startDir: VirtualFile, query: string): Promise<VirtualFile[]>;

  abstract refreshIndex(file: VirtualFile, recursive: boolean, forceUpdate?: boolean): Promise<void>;

  abstract deleteIndex(file: VirtualFile): Promise<void>;

  abstract renameIndex(src: VirtualFile, dest: VirtualFile): Promise<void>;

  abstract clearIndex(user: ApolloUser, fileSystem?: VirtualFileSystem): Promise<void>;

  static getInstance(): FileIndex | null {
    if (this.instance === undefined) {
      if (getPrismaClient() != null) {
        this.instance = new PostgresFileIndex();
      }
    }

    return this.instance;
  }
}
