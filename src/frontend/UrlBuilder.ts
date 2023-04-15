import Fs from 'node:fs';
import Path from 'node:path';
import IUserFile from '../files/IUserFile';

export default class UrlBuilder {
  static async buildUrl(file: IUserFile, fileStat?: Fs.Stats): Promise<string> {
    let basePath;

    if (file.getFileSystem() == file.getOwner().getDefaultFileSystem()) {
      basePath = `/browse/`;
    } else if (file.getFileSystem() == file.getOwner().getTrashBinFileSystem()) {
      basePath = `/trash/`;
    } else {
      throw new Error('Cannot generate url for given file system');
    }

    const isDirectory = fileStat?.isDirectory() ?? await file.isDirectory();

    return Path.join(basePath, encodeURI(file.getPath()), isDirectory ? '/' : '');
  }
}
