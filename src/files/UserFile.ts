import * as Fs from 'fs';
import * as NodeStream from 'node:stream';
import * as Path from 'path';
import AbstractUser from '../AbstractUser';
import { getFileTypeUtils } from '../Constants';
import IUserFileSystem from './filesystems/IUserFileSystem';
import IUserFile from './IUserFile';

export default class UserFile implements IUserFile {
  private readonly userFileSystem: IUserFileSystem;
  private readonly path: string;

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

  async stat(): Promise<Fs.Stats> {
    return Fs.promises.stat(this.getAbsolutePathOnHost());
  }

  async getMimeType(): Promise<string | null> {
    if (!(await this.isFile())) {
      return null;
    }

    return getFileTypeUtils().getMimeType(this.getAbsolutePathOnHost());
  }

  async generateCacheId(): Promise<string> {
    const fileStat = await this.exists() ? await this.stat() : {mtimeMs: -1, size: -1};

    return Buffer.from(this.getAbsolutePathOnHost() + ';' + fileStat.mtimeMs + ';' + fileStat.size)
        .toString('base64');
  }
}
