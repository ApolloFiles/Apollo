import { singleton } from 'tsyringe';
import type { AppCache } from '../AppCache.js';
import { FileContentCache } from '../FileContentCache.js';
import type { UserCache } from '../UserCache.js';

type RegisteredCache = AppCache<any> | UserCache<any> | FileContentCache<any>;

/** @internal */
@singleton()
export class CacheNamespaceRegistry {
  private readonly registeredVersions = new Map<string, Set<number>>();
  private readonly fileContentNamespaces = new Set<string>();
  private closed = false;

  register(cache: RegisteredCache): void {
    const { namespace, version } = cache.definition;
    if (this.closed) {
      throw new Error(`Cache namespace '${namespace}' version ${version} is registered after startup (${cache.constructor.name}) – mark its class with @EagerSingleton() and import it in container-init.ts`);
    }

    const versions = this.registeredVersions.get(namespace) ?? new Set();
    if (versions.has(version)) {
      throw new Error(`Cache namespace '${namespace}' version ${version} is registered more than once (${cache.constructor.name})`);
    }

    versions.add(version);
    this.registeredVersions.set(namespace, versions);
    if (cache instanceof FileContentCache) {
      this.fileContentNamespaces.add(namespace);
    }
  }

  /**
   * Automatic cleanup tasks might delete files of caches that are not registered at app launch,
   * which is why we close the registry during the app boot process and make sure the developer knows about this.
   */
  close(): void {
    this.closed = true;
  }

  /** Namespace -> its registered versions */
  getRegisteredVersions(): ReadonlyMap<string, ReadonlySet<number>> {
    return this.registeredVersions;
  }

  getFileContentNamespaces(): readonly string[] {
    return [...this.fileContentNamespaces];
  }
}
