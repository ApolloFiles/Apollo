import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import { Prisma } from '../../../database/prisma-client/client.js';
import { CacheEntryDeleter } from '../../internal/CacheEntryDeleter.js';
import { CacheNamespaceRegistry } from '../../internal/CacheNamespaceRegistry.js';
import type { DeletedCacheRow } from '../../internal/database/CacheIndexRow.js';
import { UnknownCacheNamespaceFinder } from '../UnknownCacheNamespaceFinder.js';

const BATCH_SIZE = 1000;

const CACHE_TABLES = [
  { name: Prisma.raw('cache_app_entries'), userId: Prisma.raw('NULL::text') },
  { name: Prisma.raw('cache_user_entries'), userId: Prisma.raw('user_id') },
];

type CacheTable = typeof CACHE_TABLES[number];

/**
 * Deletes expired entries, entries of unregistered versions and of namespaces that stayed unknown for too long
 * @internal
 */
@singleton()
export class CacheExpireJob {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly cacheNamespaceRegistry: CacheNamespaceRegistry,
    private readonly unknownCacheNamespaceFinder: UnknownCacheNamespaceFinder,
    private readonly cacheEntryDeleter: CacheEntryDeleter,
  ) {
  }

  async run(): Promise<void> {
    let deletedCount = await this.deleteEverywhere(Prisma.sql`keep_until < now()`);

    for (const [namespace, versions] of this.cacheNamespaceRegistry.getRegisteredVersions()) {
      deletedCount += await this.deleteEverywhere(Prisma.sql`namespace = ${namespace} AND version <> ALL(${[...versions]}::int[])`);
    }

    const abandonedNamespaces = await this.findAbandonedNamespaces();
    if (abandonedNamespaces.length > 0) {
      deletedCount += await this.deleteEverywhere(Prisma.sql`namespace = ANY(${abandonedNamespaces}::text[])`);
    }

    if (deletedCount > 0) {
      console.info(`[INFO] Deleted ${deletedCount} expired or outdated cache entries`);
    }
  }

  private async findAbandonedNamespaces(): Promise<string[]> {
    const now = await this.databaseClient.fetchNow();

    return (await this.unknownCacheNamespaceFinder.find())
      .filter((unknown) => unknown.deletableAfter < now)
      .map((unknown) => unknown.namespace);
  }

  private async deleteEverywhere(condition: Prisma.Sql): Promise<number> {
    let deletedCount = 0;
    for (const table of CACHE_TABLES) {
      deletedCount += await this.deleteInBatches(table, condition);
    }
    return deletedCount;
  }

  private async deleteInBatches(table: CacheTable, condition: Prisma.Sql): Promise<number> {
    let deletedCount = 0;
    let deletedRows: DeletedCacheRow[];
    do {
      // The condition is repeated outside the subquery, so a row overwritten in the meantime is re-checked and kept
      deletedRows = await this.databaseClient.$queryRaw<DeletedCacheRow[]>`
        DELETE FROM ${table.name}
        WHERE id IN (SELECT id FROM ${table.name} WHERE ${condition} LIMIT ${BATCH_SIZE})
          AND ${condition}
        RETURNING ${table.userId} AS "userId", namespace, version, file_id AS "fileId"`;

      await this.cacheEntryDeleter.deleteFilesOf(deletedRows);
      deletedCount += deletedRows.length;
    } while (deletedRows.length === BATCH_SIZE);

    return deletedCount;
  }
}
