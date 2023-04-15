import Fs from 'node:fs';
import NodeCache from 'node-cache';
import IUserFile from '../files/IUserFile';

export default class FileStatCache {
  private readonly cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 60 * 60,
      useClones: false
    });
  }

  clearAll(): void {
    this.cache.flushAll();
  }

  async clearFile(file: IUserFile): Promise<void> {
    const cacheClear = Promise.all([
      this.getCacheKey(file, 'stat').then(key => this.cache.del(key)),
      this.getCacheKey(file, 'mimeType').then(key => this.cache.del(key))
    ]);

    if (file.getPath().lastIndexOf('/') === 0) {
      this.cache.keys()
          .filter(key => key.endsWith(`:directorySize`))
          .forEach(key => this.cache.del(key));
    } else {
      const subdirPath = file.getFileSystem().getFile(file.getPath().substring(0, file.getPath().indexOf('/', 1) + 1)).getAbsolutePathOnHost();

      if (subdirPath != null) {
        this.cache.keys()
            .filter(key => key.startsWith(subdirPath))
            .forEach(key => this.cache.del(key));
      }
    }


    await cacheClear;
  }

  async setStat(file: IUserFile, stat: Fs.Stats): Promise<void> {
    this.cache.set(await this.getCacheKey(file, 'stat'), stat);
  }

  async getStat(file: IUserFile): Promise<Fs.Stats | undefined> {
    return this.cache.get(await this.getCacheKey(file, 'stat'));
  }

  async setMimeType(file: IUserFile, mimeType: string | null): Promise<void> {
    this.cache.set(await this.getCacheKey(file, 'mimeType'), mimeType);
  }

  async getMimeType(file: IUserFile): Promise<string | null | undefined> {
    return this.cache.get(await this.getCacheKey(file, 'mimeType'));
  }

  async setDirectorySize(filePath: string, size: number): Promise<void> {
    this.cache.set(`${filePath}:directorySize`, size);
  }

  async getDirectorySize(filePath: string): Promise<number | undefined> {
    return this.cache.get(`${filePath}:directorySize`);
  }

  private async getCacheKey(file: IUserFile, type: 'stat' | 'mimeType'): Promise<string> {
    return `${await file.generateCacheId()}:${type}`;
  }
}
