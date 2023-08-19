import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import AbstractUser from '../AbstractUser';
import {getAppTmpDir} from '../Constants';

export default class FileSystemBasedCache {
  private static INSTANCE: FileSystemBasedCache;

  protected constructor() {
  }

  async setUserAssociatedCachedFile(user: AbstractUser, cacheSubKey: string, data: Buffer): Promise<void> {
    const cacheFilePath = this.generateUserAssociatedCacheFilePath(user, cacheSubKey);

    await Fs.promises.mkdir(Path.dirname(cacheFilePath), {recursive: true});
    await Fs.promises.writeFile(cacheFilePath, data);
  }

  async getUserAssociatedCachedFile(user: AbstractUser, cacheSubKey: string): Promise<Buffer | null> {
    const cacheFilePath = this.generateUserAssociatedCacheFilePath(user, cacheSubKey);

    if (!Fs.existsSync(cacheFilePath)) {
      return null;
    }
    return Fs.promises.readFile(cacheFilePath);
  }

  private generateUserAssociatedCacheFilePath(user: AbstractUser, cacheSubKey: string): string {
    const cacheFileName = Crypto
      .createHash('sha256')
      .update(cacheSubKey)
      .digest('base64');

    return Path.join(getAppTmpDir(), 'fileSystemBasedCache', user.getId().toString(), cacheFileName);
  }

  static getInstance(): FileSystemBasedCache {
    if (!FileSystemBasedCache.INSTANCE) {
      FileSystemBasedCache.INSTANCE = new FileSystemBasedCache();
    }
    return FileSystemBasedCache.INSTANCE;
  }
}
