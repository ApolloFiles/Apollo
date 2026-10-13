import type { CacheDefinition } from './CacheDefinition.js';
import type { CacheEntry } from './CacheEntry.js';
import type { CacheFactory, CacheGetOrCreateOptions, CacheWriteOptions } from './CacheFactory.js';
import { CacheEngine, type CacheScope } from './internal/CacheEngine.js';
import type { CacheServices } from './internal/CacheServices.js';

export abstract class AppCache<T extends {} | null> {
  private readonly engine: CacheEngine<T>;
  private readonly scope: CacheScope;

  protected constructor(
    services: CacheServices,
    public readonly definition: CacheDefinition<T>,
  ) {
    this.engine = new CacheEngine(services, definition);
    services.cacheNamespaceRegistry.register(this);
    this.scope = { index: services.appCacheIndex, userId: null };
  }

  /** @returns `undefined` for cache misses */
  get(key: string): Promise<CacheEntry<T> | undefined> {
    return this.engine.get(this.scope, key);
  }

  getOrCreate(key: string, factory: CacheFactory<T>, options?: CacheGetOrCreateOptions): Promise<CacheEntry<T>> {
    return this.engine.getOrCreate(this.scope, key, factory, options);
  }

  set(key: string, value: T, options?: CacheWriteOptions): Promise<void> {
    return this.engine.set(this.scope, key, value, options);
  }

  delete(key: string): Promise<void> {
    return this.engine.delete(this.scope, key);
  }
}
