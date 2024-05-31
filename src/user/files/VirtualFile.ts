import Fs from 'node:fs';
import Path from 'node:path';
import NodeStream from 'node:stream';
import ApolloUser from '../ApolloUser';
import ApolloFileUrl from './url/ApolloFileUrl';
import VirtualFileSystem from './VirtualFileSystem';

export default abstract class VirtualFile<T extends VirtualFileSystem = VirtualFileSystem> {
  public readonly fileSystem: T;
  public readonly path: string;

  protected constructor(fileSystem: T, path: string) {
    if (!Path.isAbsolute(path)) {
      throw new Error('Path must be absolute');
    }

    this.fileSystem = fileSystem;
    this.path = this.normalizePath(path);
  }

  abstract read(): Promise<Buffer>;

  abstract getReadStream(options?: { start?: number, end?: number }): NodeStream.Readable;

  abstract getFiles(): Promise<VirtualFile[]>;

  abstract stat(forceRefresh?: boolean): Promise<Fs.Stats>;

  abstract getSize(forceRefresh?: boolean): Promise<number> ;

  abstract getMimeType(forceRefresh?: boolean): Promise<string | null>;

  getFileName(): string {
    return Path.basename(this.path);
  }

  canRead(user: ApolloUser): boolean {
    return false; // TODO
  }

  canWrite(user: ApolloUser): boolean {
    return false; // TODO
  }

  async exists(): Promise<boolean> {
    try {
      await this.stat();
      return true;
    } catch (err: any) {
      if (err.code == 'ENOENT') {
        return false;
      }

      throw err;
    }
  }

  async isFile(): Promise<boolean> {
    return (await this.exists()) && (await this.stat()).isFile();
  }

  async isDirectory(): Promise<boolean> {
    return (await this.exists()) && (await this.stat()).isDirectory();
  }

  toUrl(): ApolloFileUrl {
    return ApolloFileUrl.create(this.fileSystem.owner.id, this.fileSystem.id, this.path);
  }

  private normalizePath(path: string): string {
    path = Path.normalize(path);
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }
}
