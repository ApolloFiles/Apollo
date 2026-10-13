import type { CacheDefinition } from './CacheDefinition.js';
import type { CacheEntry } from './CacheEntry.js';
import type { CacheFactory, UserCacheGetOrCreateOptions, UserCacheWriteOptions } from './CacheFactory.js';
import type { CacheEngine, CacheScope } from './internal/CacheEngine.js';
import type { CacheServices } from './internal/CacheServices.js';
import type { DeletedCacheRow } from './internal/database/CacheIndexRow.js';
import type { BoundUserCacheIndex } from './internal/database/UserCacheIndex.js';

export class BoundUserCache<T extends {} | null> {
  private readonly index: BoundUserCacheIndex;
  private readonly scope: CacheScope;

  /** @internal Use {@link UserCache.forUser} */
  constructor(
    private readonly engine: CacheEngine<T>,
    private readonly definition: CacheDefinition<T>,
    private readonly services: CacheServices,
    userId: string,
  ) {
    this.index = services.userCacheIndex.forUser(userId);
    this.scope = { index: this.index, userId };
  }

  /** @returns `undefined` for cache misses */
  get(key: string): Promise<CacheEntry<T> | undefined> {
    return this.engine.get(this.scope, key);
  }

  getOrCreate(key: string, factory: CacheFactory<T>, options?: UserCacheGetOrCreateOptions): Promise<CacheEntry<T>> {
    return this.engine.getOrCreate(this.scope, key, factory, options);
  }

  set(key: string, value: T, options?: UserCacheWriteOptions): Promise<void> {
    return this.engine.set(this.scope, key, value, options);
  }

  delete(key: string): Promise<void> {
    return this.engine.delete(this.scope, key);
  }

  /** Deletes the group's entries of every version of this namespace */
  deleteGroup(groupKey: string): Promise<void> {
    return this.deleteRows(`group '${groupKey}'`, () => this.index.deleteGroup(this.definition.namespace, groupKey));
  }

  /** A directory prefix has to end in `/`, otherwise `/movies/Foo` also matches `/movies/Foobar` */
  deleteGroupPrefix(groupKeyPrefix: string): Promise<void> {
    return this.deleteRows(`groups starting with '${groupKeyPrefix}'`, () => this.index.deleteGroupPrefix(this.definition.namespace, groupKeyPrefix));
  }

  private async deleteRows(description: string, deleteRows: () => Promise<DeletedCacheRow[]>): Promise<void> {
    try {
      await this.services.cacheEntryDeleter.deleteFilesOf(await deleteRows());
    } catch (err) {
      console.warn(`[WARN] Could not delete the ${description} of ${this.definition.namespace}:`, err);
    }
  }
}
