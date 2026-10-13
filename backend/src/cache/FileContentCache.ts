import type VirtualFile from '../files/VirtualFile.js';
import { NodeFsUtils } from '../utils/NodeFsUtils.js';
import type { CacheDefinition } from './CacheDefinition.js';
import type { CacheEntry } from './CacheEntry.js';
import type { CacheFactory, CacheGetOrCreateOptions } from './CacheFactory.js';
import { CacheScopeError } from './error/CacheScopeError.js';
import { CacheEngine, type CacheScope } from './internal/CacheEngine.js';
import type { CacheServices } from './internal/CacheServices.js';
import { FileContentCacheKeyHelper } from './internal/FileContentCacheKeyHelper.js';

/**
 * Caches data derived from a file's content in the user cache of the file system's owner – never the viewer's.
 * An entry is only valid while the file's size and modification time are unchanged.
 */
export abstract class FileContentCache<T extends {} | null> {
  private readonly engine: CacheEngine<T>;

  protected constructor(
    private readonly services: CacheServices,
    public readonly definition: CacheDefinition<T>,
  ) {
    this.engine = new CacheEngine(services, definition);
    services.cacheNamespaceRegistry.register(this);
  }

  /** `undefined` is a miss, also when the file changed since the entry was created or no longer exists */
  async get(file: VirtualFile, entryName: string): Promise<CacheEntry<T> | undefined> {
    const scope = this.toScope(file);
    const key = FileContentCacheKeyHelper.toEntryKey(file, entryName);

    const validator = await NodeFsUtils.nullIfMissing(this.determineValidator(file));
    if (validator == null) {
      return undefined;
    }

    return this.engine.get(scope, key, validator);
  }

  /** Rejects with `ENOENT` when the file does not exist */
  async getOrCreate(file: VirtualFile, entryName: string, factory: CacheFactory<T>, options?: CacheGetOrCreateOptions): Promise<CacheEntry<T>> {
    const scope = this.toScope(file);
    const key = FileContentCacheKeyHelper.toEntryKey(file, entryName);
    return this.engine.getOrCreate(scope, key, factory, {
      ...options,
      groupKey: FileContentCacheKeyHelper.toGroupKey(file),
      validator: await this.determineValidator(file),
    });
  }

  async delete(file: VirtualFile, entryName: string): Promise<void> {
    await this.engine.delete(this.toScope(file), FileContentCacheKeyHelper.toEntryKey(file, entryName));
  }

  private toScope(file: VirtualFile): CacheScope {
    const owner = file.fileSystem.owner;
    if (owner == null) {
      throw new CacheScopeError(`File system '${file.fileSystem.id}' has no owner, so there is no user cache for its files`);
    }
    return { index: this.services.userCacheIndex.forUser(owner.id), userId: owner.id };
  }

  /** Taken before the factory runs: a file changing during generation then invalidates the entry instead of hiding the change */
  private async determineValidator(file: VirtualFile): Promise<string> {
    const stats = await file.stat();
    return `${stats.size};${stats.mtimeMs}`;
  }
}
