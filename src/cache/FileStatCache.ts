import Fs from 'fs';
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
