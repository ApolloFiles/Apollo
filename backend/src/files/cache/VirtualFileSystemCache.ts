import type VirtualFileSystem from '../VirtualFileSystem.js';
import ManualVirtualFileSystemCache from './ManualVirtualFileSystemCache.js';
import type { CacheItem, CacheValue, default as SimpleCacheInterface } from './SimpleCacheInterface.js';

export default class VirtualFileSystemCache<T extends (CacheValue | Buffer) = CacheValue> implements SimpleCacheInterface<T> {
  // prefixes are ALWAYS a single byte
  private static readonly VALUE_PREFIX_BUFFER = 0x42; // 'B'
  private static readonly VALUE_PREFIX_PRIMITIVE = 0x50; // 'P'

  private readonly cacheBackend: ManualVirtualFileSystemCache;

  constructor(fileSystem: VirtualFileSystem, basePath = '/') {
    this.cacheBackend = new ManualVirtualFileSystemCache(fileSystem, basePath);
  }

  async get(key: string): Promise<Readonly<CacheItem<T>> | null> {
    const cachedItem = await this.cacheBackend.get(key);
    if (cachedItem == null) {
      return null;
    }

    const cachedValueRawBytes = await cachedItem.file.read();
    const valuePrefix = cachedValueRawBytes[0];
    const cachedValueBytes = cachedValueRawBytes.subarray(1);

    const isPrimitiveValue = valuePrefix === VirtualFileSystemCache.VALUE_PREFIX_PRIMITIVE;

    return {
      value: isPrimitiveValue ? JSON.parse(cachedValueBytes.toString()) : cachedValueBytes,
      createdAt: cachedItem.createdAt,
      expiresAt: cachedItem.expiresAt,
    };
  }

  async set(key: string, value: T, ttlInSeconds?: number): Promise<void> {
    const cacheFile = await this.cacheBackend.create(key, ttlInSeconds);

    let cacheValueBytes: Buffer;
    if (Buffer.isBuffer(value)) {
      cacheValueBytes = Buffer.concat([Buffer.from([VirtualFileSystemCache.VALUE_PREFIX_BUFFER]), value]);
    } else {
      const primitiveBytes = Buffer.from(JSON.stringify(value));
      cacheValueBytes = Buffer.concat([Buffer.from([VirtualFileSystemCache.VALUE_PREFIX_PRIMITIVE]), primitiveBytes]);
    }

    await cacheFile.write(cacheValueBytes);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) != null;
  }

  async delete(key: string): Promise<void> {
    await this.cacheBackend.delete(key);
  }

  async clear(): Promise<void> {
    await this.cacheBackend.clear();
  }
}
