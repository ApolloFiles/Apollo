import Fs from 'fs';
import * as Stream from 'node:stream';
import AbstractUser from '../AbstractUser';
import IUserFileSystem from './filesystems/IUserFileSystem';

export default interface IUserFile {
  getName(): string;
  getPath(): string;
  getAbsolutePathOnHost(): string | null;
  getFileSystem(): IUserFileSystem;

  getOwner(): AbstractUser;

  exists(): Promise<boolean>;
  isFile(): Promise<boolean>;
  isDirectory(): Promise<boolean>;

  getFiles(): Promise<IUserFile[]>;
  read(): Promise<Buffer>;
  getReadStream(options?: { start?: number, end?: number }): Stream.Readable;

  stat(): Promise<Fs.Stats>;
  getMimeType(): Promise<string | null>;

  generateCacheId(): Promise<string>;
}
