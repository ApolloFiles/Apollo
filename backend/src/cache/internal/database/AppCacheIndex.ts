import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import type { CacheIndexRow } from './CacheIndexRow.js';
import { type CacheIndexWrite, toCacheIndexColumns } from './CacheIndexWrite.js';
import type { ScopedCacheIndex } from './ScopedCacheIndex.js';

/** @internal */
@singleton()
export class AppCacheIndex implements ScopedCacheIndex {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async find(namespace: string, version: number, key: string): Promise<CacheIndexRow | null> {
    const entry = await this.databaseClient.cacheAppEntry.findUnique({
      where: { namespace_version_key: { namespace, version, key } },
    });

    if (entry == null) {
      return null;
    }
    return {
      ...entry,
      userId: null,
      sizeBytes: Number(entry.sizeBytes),
    };
  }

  async upsertReturningPrevious(write: CacheIndexWrite): Promise<{ previousFileId: string | null }> {
    const uniqueKey = { namespace: write.namespace, version: write.version, key: write.key };
    const columns = toCacheIndexColumns(write);

    return this.databaseClient.$transaction(async (transaction) => {
      const [previous] = await transaction.$queryRaw<{ fileId: string | null }[]>`
        SELECT file_id AS "fileId"
        FROM cache_app_entries
        WHERE namespace = ${uniqueKey.namespace} AND version = ${uniqueKey.version} AND key = ${uniqueKey.key}
        FOR UPDATE`;

      await transaction.cacheAppEntry.upsert({
        where: { namespace_version_key: uniqueKey },
        create: { ...uniqueKey, ...columns },
        update: columns,
      });

      return { previousFileId: previous?.fileId ?? null };
    });
  }

  async deleteExact(row: CacheIndexRow): Promise<boolean> {
    const result = await this.databaseClient.cacheAppEntry.deleteMany({
      where: { id: row.id, fileId: row.fileId, createdAt: row.createdAt },
    });
    return result.count === 1;
  }

  async touch(id: bigint): Promise<void> {
    await this.databaseClient.$executeRaw`UPDATE cache_app_entries SET last_accessed_at = now() WHERE id = ${id}`;
  }
}
