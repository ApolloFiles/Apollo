import * as FastDirectorySize from 'fast-directory-size';
import Fs from 'node:fs';
import * as NodeStream from 'node:stream';
import Path from 'node:path';
import AbstractUser from '../AbstractUser';
import { getFileStatCache, getFileTypeUtils } from '../Constants';
import IUserFileSystem from './filesystems/IUserFileSystem';
import IUserFile from './IUserFile';

export default class UserFile implements IUserFile {
  private readonly userFileSystem: IUserFileSystem;
  private readonly path: string;

  private cachedGeneratedCacheId: string | undefined;

  constructor(userFileSystem: IUserFileSystem, path: string) {
    if (!Path.isAbsolute(path)) {
      throw new Error('Path must be absolute');
    }

    path = Path.normalize(path);
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    this.userFileSystem = userFileSystem;
    this.path = path;

    // This should be impossible as we join two absolute paths but just in case something goes extremely wrong
    if (!this.getAbsolutePathOnHost().startsWith(userFileSystem.getAbsolutePathOnHost())) {
      throw new Error('Path must be inside the user file system');
    }
  }

  getName(): string {
    return Path.basename(this.getAbsolutePathOnHost());
  }

  getPath(): string {
    return this.path;
  }

  getAbsolutePathOnHost(): string {
    return Path.join(this.userFileSystem.getAbsolutePathOnHost(), this.path);
  }

  getFileSystem(): IUserFileSystem {
    return this.userFileSystem;
  }

  getOwner(): AbstractUser {
    return this.userFileSystem.getOwner();
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

  async getFiles(): Promise<IUserFile[]> {
    if (!await this.isDirectory()) {
      throw new Error(`${this.path} is not a directory`);
    }

    const pathToFetch = this.getAbsolutePathOnHost();
    const fileNames = await Fs.promises.readdir(pathToFetch);

    const result: IUserFile[] = [];
    for (const file of fileNames) {
      result.push(this.userFileSystem.getFile(Path.join(this.path, file)));
    }

    return result;
  }

  async read(): Promise<Buffer> {
    return Fs.promises.readFile(this.getAbsolutePathOnHost());
  }

  getReadStream(options?: { start?: number, end?: number }): NodeStream.Readable {
    return Fs.createReadStream(this.getAbsolutePathOnHost(), options);
  }

  async stat(forceRefresh: boolean = false): Promise<Fs.Stats> {
    if (!forceRefresh) {
      const cachedStat = await getFileStatCache().getStat(this);
      if (cachedStat != null) {
        return cachedStat;
      }
    }

    const fileStat = await Fs.promises.stat(this.getAbsolutePathOnHost());
    await getFileStatCache().setStat(this, fileStat);
    return fileStat;
  }

  async getMimeType(forceRefresh: boolean = false): Promise<string | null> {
    if (!forceRefresh) {
      const cachedMimeType = await getFileStatCache().getMimeType(this);
      if (cachedMimeType !== undefined) {
        return cachedMimeType;
      }
    }

    let mimeType = null;
    if (await this.isFile()) {
      mimeType = await getFileTypeUtils().getMimeType(this.getAbsolutePathOnHost());
    }

    await getFileStatCache().setMimeType(this, mimeType);
    return mimeType;
  }

  async getSize(forceRefresh?: boolean): Promise<number> {
    if (await this.isFile()) {
      return this.stat(forceRefresh).then((stat) => stat.size);
    }

    if (!(await this.isDirectory())) {
      return -1;
    }

    if (!forceRefresh) {
      const cachedSize = await getFileStatCache().getDirectorySize(this.getAbsolutePathOnHost());
      if (cachedSize != null) {
        return cachedSize;
      }
    }

    const size = await FastDirectorySize.getDirectorySize(this.getAbsolutePathOnHost());
    await getFileStatCache().setDirectorySize(this.getAbsolutePathOnHost(), size);
    return size;
  }

  async generateCacheId(forceRefresh: boolean = false): Promise<string> {
    if (forceRefresh || this.cachedGeneratedCacheId == null) {
      let fileStat = {mtimeMs: -1, size: -1};
      try {
        fileStat = await Fs.promises.stat(this.getAbsolutePathOnHost());
      } catch (fileNotExists) {
      }

      this.cachedGeneratedCacheId = Buffer.from(this.getAbsolutePathOnHost() + ';' + fileStat.mtimeMs + ';' + fileStat.size)
          .toString('base64');
    }

    return this.cachedGeneratedCacheId;
  }

  equals(other: IUserFile): boolean {
    return this.getAbsolutePathOnHost() === other.getAbsolutePathOnHost();
  }
}
