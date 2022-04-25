import { Mutex } from 'async-mutex';
import express from 'express';
import * as fastDirectorySize from 'fast-directory-size';
import Fs from 'fs';
import * as Path from 'path';
import AbstractUser from '../../AbstractUser';
import IUserFile from '../IUserFile';
import IUserFileWriteable from '../IUserFileWriteable';
import UserFile from '../UserFile';
import UserFileWriteable from '../UserFileWriteable';
import IUserFileSystem from './IUserFileSystem';

export default class UserFileSystem implements IUserFileSystem {
  private readonly owner: AbstractUser;
  private readonly rootOnHost: string;

  private readonly fileLocks: { [path: string]: Mutex } = {};
  private readonly fileLockMutex: Mutex = new Mutex();

  constructor(owner: AbstractUser, rootOnHost: string) {
    if (!Path.isAbsolute(rootOnHost)) {
      throw new Error('rootOnHost must be an absolute path');
    }

    rootOnHost = Path.normalize(rootOnHost);

    const rootOnHostExists = Fs.existsSync(rootOnHost);
    const rootOnHostIsDirectory = !rootOnHostExists || Fs.lstatSync(rootOnHost).isDirectory();

    if (rootOnHostExists && !rootOnHostIsDirectory) {
      throw new Error(`The given 'rootOnHost' already exists and is not a directory`);
    }
    if (!rootOnHostExists) {
      Fs.mkdirSync(rootOnHost, {recursive: true});
    }

    this.owner = owner;
    this.rootOnHost = rootOnHost + Path.sep;
  }

  getFile(path: string): IUserFile {
    return new UserFile(this, path);
  }

  async getFiles(path: string): Promise<IUserFile[]> {
    return this.getFile(path).getFiles();
  }

  getOwner(): AbstractUser {
    return this.owner;
  }

  async getSize(): Promise<number> {
    return await fastDirectorySize.getDirectorySize(this.getAbsolutePathOnHost());
  }

  async acquireLock(req: express.Request, file: IUserFile, action: (file: IUserFileWriteable) => void | Promise<void>): Promise<void> {
    // TODO: Take parent files into consideration
    // TODO: Have an extra method to lock on directories, blocking writes to all files inside of it (recursively)
    const releaseFileMutex = await this.fileLockMutex.runExclusive(async () => {
      let fileMutex = this.fileLocks[file.getPath()];

      if (!fileMutex) {
        fileMutex = new Mutex();
        this.fileLocks[file.getPath()] = fileMutex;
      }

      return fileMutex.acquire();
    });

    await action(new UserFileWriteable(req, file));
    releaseFileMutex();
  }

  getAbsolutePathOnHost(): string {
    return this.rootOnHost;
  }
}
