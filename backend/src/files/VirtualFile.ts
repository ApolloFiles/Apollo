import Fs from 'node:fs';
import Path from 'node:path';
import NodeStream from 'node:stream';
import ApolloFileURI from '../uri/ApolloFileURI.js';
import VirtualFileSystem from './VirtualFileSystem.js';

export default abstract class VirtualFile<T extends VirtualFileSystem = VirtualFileSystem> {
  public readonly path: string;

  protected constructor(
    public readonly fileSystem: T,
    path: string,
  ) {
    if (!Path.isAbsolute(path)) {
      throw new Error('Path must be absolute');
    }

    this.path = this.normalizePath(path);
  }

  abstract supportsStreaming(): boolean;

  abstract read(): Promise<Buffer>;

  abstract createReadStream(options?: { start?: number, end?: number }): NodeStream.Readable;

  abstract getFiles(): Promise<VirtualFile[]>;

  abstract stat(): Promise<Fs.Stats>;

  getFileName(): string {
    return Path.basename(this.path);
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

  toURI(): ApolloFileURI {
    return ApolloFileURI.create(this.fileSystem.owner?.id ?? VirtualFileSystem.SYSTEM_USER_ID, this.fileSystem.id, this.path);
  }

  private normalizePath(path: string): string {
    path = Path.normalize(path);
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }
}
