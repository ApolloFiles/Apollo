import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { CacheMissCounter } from './CacheMissCounter.js';
import { CacheEntryDeleter } from './CacheEntryDeleter.js';
import { CacheFileStorage } from './CacheFileStorage.js';
import { CacheNamespaceRegistry } from './CacheNamespaceRegistry.js';
import { AppCacheIndex } from './database/AppCacheIndex.js';
import { UserCacheIndex } from './database/UserCacheIndex.js';

/**
 * Bundles what every cache class needs, so their constructors take a single parameter
 */
@singleton()
export class CacheServices {
  /** @internal */
  constructor(
    /** @internal */
    public readonly databaseClient: DatabaseClient,
    /** @internal */
    public readonly appCacheIndex: AppCacheIndex,
    /** @internal */
    public readonly userCacheIndex: UserCacheIndex,
    /** @internal */
    public readonly cacheFileStorage: CacheFileStorage,
    /** @internal */
    public readonly cacheEntryDeleter: CacheEntryDeleter,
    /** @internal */
    public readonly cacheMissCounter: CacheMissCounter,
    /** @internal */
    public readonly cacheNamespaceRegistry: CacheNamespaceRegistry,
  ) {
  }
}
