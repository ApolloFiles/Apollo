import type { CacheItem, CacheValue, default as SimpleCacheInterface } from './SimpleCacheInterface.js';

export default class InMemoryCache<T = CacheValue> implements SimpleCacheInterface<T> {
  private readonly cache = new Map<string, CacheItem<T>>();

  get(key: string): Readonly<CacheItem<T>> | null {
    const cacheItem = this.cache.get(key);
    if (cacheItem == null) {
      return null;
    }

    if (cacheItem.expiresAt !== null && Date.now() >= cacheItem.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cacheItem;
  }

  set(key: string, value: T, ttlInSeconds?: number): void {
    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: ttlInSeconds != null ? Date.now() + ttlInSeconds * 1000 : null,
    });
  }

  has(key: string): boolean {
    return this.get(key) != null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
