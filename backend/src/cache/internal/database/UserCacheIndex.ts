import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import { Prisma } from '../../../database/prisma-client/client.js';
import type { CacheIndexRow, DeletedCacheRow } from './CacheIndexRow.js';
import { type CacheIndexWrite, toCacheIndexColumns } from './CacheIndexWrite.js';
import type { ScopedCacheIndex } from './ScopedCacheIndex.js';

/** @internal */
@singleton()
export class UserCacheIndex {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  forUser(userId: string): BoundUserCacheIndex {
    return new BoundUserCacheIndex(this.databaseClient, userId);
  }
}

/** @internal */
export class BoundUserCacheIndex implements ScopedCacheIndex {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly userId: string,
  ) {
  }

  async find(namespace: string, version: number, key: string): Promise<CacheIndexRow | null> {
    const entry = await this.databaseClient.cacheUserEntry.findUnique({
      where: { userId_namespace_version_key: { userId: this.userId, namespace, version, key } },
    });
    return entry != null ? { ...entry, sizeBytes: Number(entry.sizeBytes) } : null;
  }

  async upsertReturningPrevious(write: CacheIndexWrite): Promise<{ previousFileId: string | null }> {
    const uniqueKey = { userId: this.userId, namespace: write.namespace, version: write.version, key: write.key };
    const columns = toCacheIndexColumns(write);

    return this.databaseClient.$transaction(async (transaction) => {
      // The lock makes a concurrent write of the key wait, so it sees this write's file as the one it replaces
      const [previous] = await transaction.$queryRaw<{ fileId: string | null }[]>`
        SELECT file_id AS "fileId"
        FROM cache_user_entries
        WHERE user_id = ${this.userId} AND namespace = ${write.namespace} AND version = ${write.version} AND key = ${write.key}
        FOR UPDATE`;
      await transaction.cacheUserEntry.upsert({
        where: { userId_namespace_version_key: uniqueKey },
        create: { ...uniqueKey, ...columns },
        update: columns,
      });
      return { previousFileId: previous?.fileId ?? null };
    });
  }

  async deleteExact(row: CacheIndexRow): Promise<boolean> {
    const result = await this.databaseClient.cacheUserEntry.deleteMany({
      where: { userId: this.userId, id: row.id, fileId: row.fileId, createdAt: row.createdAt },
    });
    return result.count === 1;
  }

  async touch(id: bigint): Promise<void> {
    await this.databaseClient.$executeRaw`UPDATE cache_user_entries SET last_accessed_at = now() WHERE user_id = ${this.userId} AND id = ${id}`;
  }

  /** Matches all versions of the namespace */
  deleteGroup(namespace: string, groupKey: string): Promise<DeletedCacheRow[]> {
    return this.databaseClient.$queryRaw<DeletedCacheRow[]>`
      DELETE FROM cache_user_entries
      WHERE user_id = ${this.userId}
        AND namespace = ${namespace}
        AND group_key = ${groupKey}
      RETURNING user_id AS "userId", namespace, version, file_id AS "fileId"`;
  }

  /** Matches all versions of the namespace */
  deleteGroupPrefix(namespace: string, groupKeyPrefix: string): Promise<DeletedCacheRow[]> {
    return this.databaseClient.$queryRaw<DeletedCacheRow[]>`
      DELETE FROM cache_user_entries
      WHERE user_id = ${this.userId}
        AND namespace = ${namespace}
        AND group_key LIKE ${escapeLikePattern(groupKeyPrefix) + '%'}
      RETURNING user_id AS "userId", namespace, version, file_id AS "fileId"`;
  }

  /** Deletes the entries of a file – or, should it have been a directory, of everything below it – across namespaces */
  async deleteFileGroups(namespaces: readonly string[], groupKey: string): Promise<DeletedCacheRow[]> {
    if (namespaces.length === 0) {
      return [];
    }

    return this.databaseClient.$queryRaw<DeletedCacheRow[]>`
      DELETE FROM cache_user_entries
      WHERE user_id = ${this.userId}
        AND namespace = ANY(${namespaces}::text[])
        AND ${fileGroupsCondition(groupKey)}
      RETURNING user_id AS "userId", namespace, version, file_id AS "fileId"`;
  }

  /**
   * Moves the entries of a file – or of everything below a directory – to its new path, across namespaces.
   * Entries already at the new path are replaced; their rows are returned, so their files can be deleted.
   */
  async rekeyFileGroups(namespaces: readonly string[], oldGroupKey: string, newGroupKey: string): Promise<DeletedCacheRow[]> {
    if (namespaces.length === 0 || oldGroupKey === newGroupKey) {
      return [];
    }

    return this.databaseClient.$transaction(async (transaction) => {
      const replacedRows = await transaction.$queryRaw<DeletedCacheRow[]>`
        DELETE FROM cache_user_entries
        WHERE user_id = ${this.userId}
          AND namespace = ANY(${namespaces}::text[])
          AND ${fileGroupsCondition(newGroupKey)}
        RETURNING user_id AS "userId", namespace, version, file_id AS "fileId"`;

      // length() runs in Postgres, so it counts characters the same way substr() does
      await transaction.$executeRaw`
        UPDATE cache_user_entries
        SET group_key = ${newGroupKey} || substr(group_key, length(${oldGroupKey}) + 1),
            key       = ${newGroupKey} || substr(key, length(${oldGroupKey}) + 1)
        WHERE user_id = ${this.userId}
          AND namespace = ANY(${namespaces}::text[])
          AND ${fileGroupsCondition(oldGroupKey)}`;

      return replacedRows;
    });
  }
}

/** Matches a file's group and, should it be a directory, every group below it */
function fileGroupsCondition(groupKey: string): Prisma.Sql {
  return Prisma.sql`(group_key = ${groupKey} OR group_key LIKE ${escapeLikePattern(toSubtreePrefix(groupKey)) + '%'})`;
}

/** Backslash is Postgres' default LIKE escape character */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function toSubtreePrefix(groupKey: string): string {
  return groupKey.endsWith('/') ? groupKey : `${groupKey}/`;
}
