import { TimeUnit } from '@spraxdev/node-commons/util';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { CacheNamespaceRegistry } from '../internal/CacheNamespaceRegistry.js';

interface UnknownCacheNamespace {
  namespace: string;
  sizeBytes: number;
  lastAccessedAt: Date;
  deletableAfter: Date;
}

/** @internal */
@singleton()
export class UnknownCacheNamespaceFinder {
  /** Entries of a namespace no registered cache uses are deleted once none of them was accessed for this long */
  private static readonly UNKNOWN_NAMESPACE_GRACE_MS = TimeUnit.DAYS.toMillis(30);

  private unknownNamespaces: Promise<UnknownCacheNamespace[]> | null = null;

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly cacheNamespaceRegistry: CacheNamespaceRegistry,
  ) {
  }

  /**
   * Scans the index only once: the registered caches are fixed at startup,
   * so no entry of an unknown namespace is written or read while Apollo runs
   */
  find(): Promise<UnknownCacheNamespace[]> {
    this.unknownNamespaces ??= this.scan().catch((err) => {
      this.unknownNamespaces = null;
      throw err;
    });
    return this.unknownNamespaces;
  }

  private async scan(): Promise<UnknownCacheNamespace[]> {
    const unknownNamespace = { namespace: { notIn: [...this.cacheNamespaceRegistry.getRegisteredVersions().keys()] } };
    const appGroups = await this.databaseClient.cacheAppEntry.groupBy({
      by: ['namespace'], where: unknownNamespace, _sum: { sizeBytes: true }, _max: { lastAccessedAt: true },
    });
    const userGroups = await this.databaseClient.cacheUserEntry.groupBy({
      by: ['namespace'], where: unknownNamespace, _sum: { sizeBytes: true }, _max: { lastAccessedAt: true },
    });

    const namespaces = new Map<string, UnknownCacheNamespace>();
    for (const group of [...appGroups, ...userGroups]) {
      this.add(namespaces, group.namespace, Number(group._sum.sizeBytes ?? 0), group._max.lastAccessedAt ?? new Date(0));
    }
    return [...namespaces.values()];
  }

  private add(namespaces: Map<string, UnknownCacheNamespace>, namespace: string, sizeBytes: number, lastAccessedAt: Date): void {
    const existing = namespaces.get(namespace);
    if (existing != null) {
      sizeBytes += existing.sizeBytes;
      lastAccessedAt = existing.lastAccessedAt > lastAccessedAt ? existing.lastAccessedAt : lastAccessedAt;
    }

    const deletableAfter = new Date(lastAccessedAt.getTime() + UnknownCacheNamespaceFinder.UNKNOWN_NAMESPACE_GRACE_MS);
    namespaces.set(namespace, { namespace, sizeBytes, lastAccessedAt, deletableAfter });
  }
}
