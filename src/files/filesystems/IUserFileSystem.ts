import express from 'express';
import AbstractUser from '../../AbstractUser';
import IUserFile from '../IUserFile';
import IUserFileWriteable from '../IUserFileWriteable';

export default interface IUserFileSystem {
  getUniqueId(): string;

  getOwner(): AbstractUser;

  getFile(path: string): IUserFile;
  getFiles(path: string): Promise<IUserFile[]>;

  getSize(forceRefresh?: boolean): Promise<number>;

  acquireLock(req: express.Request, file: IUserFile, action: (file: IUserFileWriteable) => void | Promise<void>): Promise<void>;

  getAbsolutePathOnHost(): string;
}
