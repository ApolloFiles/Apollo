import Fs from 'node:fs';
import Path from 'node:path';
import VirtualFile from '../user/files/VirtualFile';
import Utils from '../Utils';

export default class UrlBuilder {
  static async buildUrl(file: VirtualFile, fileStat?: Fs.Stats): Promise<string> {
    let basePath;

    if (file.fileSystem.id === file.fileSystem.owner.getDefaultFileSystem().id) {
      basePath = `/browse/`;
    } else if (file.fileSystem.id === file.fileSystem.owner.getTrashBinFileSystem().id) {
      basePath = `/trash/`;
    } else {
      throw new Error('Cannot generate url for given file system');
    }

    const isDirectory = fileStat?.isDirectory() ?? await file.isDirectory();
    return Path.join(basePath, Utils.encodeUriProperly(file.path), isDirectory ? '/' : '');
  }
}
