import Path from 'node:path';
import XXHashAddon from 'xxhash-addon';
import type VirtualFile from '../VirtualFile.js';
import type VirtualFileSystem from '../VirtualFileSystem.js';
import type WriteableVirtualFile from '../WriteableVirtualFile.js';
import type { CacheItem } from './SimpleCacheInterface.js';

type CacheItemMetadata = Pick<CacheItem<unknown>, 'createdAt' | 'expiresAt'>;
type CacheFileItem = { file: VirtualFile } & Pick<CacheItemMetadata, 'createdAt' | 'expiresAt'>

export default class ManualVirtualFileSystemCache {
  constructor(
    private readonly fileSystem: VirtualFileSystem,
    private readonly basePath = '/',
  ) {
  }

  async get(key: string): Promise<CacheFileItem | null> {
    const cachePaths = this.determineCacheFilePaths(key);

    const cacheMetadataFile = this.fileSystem.getFile(cachePaths.metadata);
    if (!(await cacheMetadataFile.isFile())) {
      return null;
    }

    const metadata = await this.readMetadataFile(cacheMetadataFile);
    if (metadata.expiresAt !== null && Date.now() >= metadata.expiresAt) {
      await this.delete(key);
      return null;
    }

    return {
      file: this.fileSystem.getFile(cachePaths.value),
      createdAt: metadata.createdAt,
      expiresAt: metadata.expiresAt,
    };
  }

  async create(key: string, ttlInSeconds?: number): Promise<WriteableVirtualFile> {
    const cachePaths = this.determineCacheFilePaths(key);

    const cacheMetadata: CacheItemMetadata = {
      createdAt: Date.now(),
      expiresAt: ttlInSeconds != null ? Date.now() + ttlInSeconds * 1000 : null,
    };

    await this.fileSystem.getWriteableFile(this.fileSystem.getFile(cachePaths.baseDir)).mkdir();
    await this.writeMetadataFile(this.fileSystem.getFile(cachePaths.metadata), cacheMetadata);

    return this.fileSystem.getWriteableFile(this.fileSystem.getFile(cachePaths.value));
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) != null;
  }

  async delete(key: string): Promise<void> {
    const cachePaths = this.determineCacheFilePaths(key);
    const cacheBaseDir = this.fileSystem.getFile(cachePaths.baseDir);

    await this.fileSystem.getWriteableFile(cacheBaseDir).delete(true);
  }

  async clear(): Promise<void> {
    const basePathFile = this.fileSystem.getFile(this.basePath);
    await this.fileSystem.getWriteableFile(basePathFile).delete(true);
  }

  private async readMetadataFile(metadataFile: VirtualFile): Promise<CacheItemMetadata> {
    const rawMetadata = (await metadataFile.read()).toString();
    const [rawCreatedAt, rawExpiresAt] = rawMetadata.split('\n');

    let expiresAt: number | null = parseInt(rawExpiresAt, 10);
    if (expiresAt <= 0) {
      expiresAt = null;
    }

    return {
      createdAt: parseInt(rawCreatedAt, 10),
      expiresAt,
    };
  }

  private async writeMetadataFile(metadataFile: VirtualFile, metadata: CacheItemMetadata): Promise<void> {
    const rawMetadata = [
      metadata.createdAt.toString(),
      (metadata.expiresAt != null ? metadata.expiresAt.toString() : '0'),
    ].join('\n');

    await this.fileSystem.getWriteableFile(metadataFile).write(Buffer.from(rawMetadata));
  }

  private determineCacheFilePaths(cacheKey: string): { baseDir: string, value: string, metadata: string } {
    const cacheKeyHash = this.calculateHash(cacheKey);
    const pathSegment1 = cacheKeyHash.slice(0, 2);
    const pathSegment2 = cacheKeyHash.slice(2, 4);
    const pathSegment3 = cacheKeyHash.slice(4);

    const baseDir = Path.join(this.basePath, pathSegment1, pathSegment2, pathSegment3);
    return {
      baseDir,
      value: Path.join(baseDir, 'value'),
      metadata: Path.join(baseDir, 'metadata'),
    };
  }

  private calculateHash(input: string): string {
    return XXHashAddon
      .XXHash128
      .hash(Buffer.from(input))
      .toString('hex');
  }
}
