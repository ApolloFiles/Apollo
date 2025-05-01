import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { container, singleton } from 'tsyringe';
import { getAppTmpDir } from '../Constants';
import ApolloUser from '../user/ApolloUser';

@singleton()
export default class FileSystemBasedCache {
  async setUserAssociatedCachedFile(user: ApolloUser, cacheSubKey: string, data: Buffer): Promise<void> {
    const cacheFilePath = this.generateUserAssociatedCacheFilePath(user, cacheSubKey);

    await Fs.promises.mkdir(Path.dirname(cacheFilePath), { recursive: true });
    await Fs.promises.writeFile(cacheFilePath, data);
  }

  async getUserAssociatedCachedFile(user: ApolloUser, cacheSubKey: string): Promise<Buffer | null> {
    const cacheFilePath = this.generateUserAssociatedCacheFilePath(user, cacheSubKey);

    try {
      return await Fs.promises.readFile(cacheFilePath);
    } catch (err: any) {
      if (err instanceof Error && (err as any).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async userAssociatedCachedFileExists(user: ApolloUser, cacheSubKey: string): Promise<boolean> {
    const cacheFilePath = this.generateUserAssociatedCacheFilePath(user, cacheSubKey);

    try {
      await Fs.promises.stat(cacheFilePath);
      return true;
    } catch (err: any) {
      if (err instanceof Error && (err as any).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  private generateUserAssociatedCacheFilePath(user: ApolloUser, cacheSubKey: string): string {
    const cacheFileName = Crypto
      .createHash('sha256')
      .update(cacheSubKey)
      .digest('hex');

    return Path.join(getAppTmpDir(), 'fileSystemBasedCache', user.id.toString() + '/', cacheFileName);
  }

  /**
   * @deprecated Use dependency container
   */
  static getInstance(): FileSystemBasedCache {
    return container.resolve(FileSystemBasedCache);
  }
}
