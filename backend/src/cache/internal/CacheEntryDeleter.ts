import { singleton } from 'tsyringe';
import { CacheFileStorage } from './CacheFileStorage.js';
import type { CacheIndexRow, DeletedCacheRow } from './database/CacheIndexRow.js';
import type { ScopedCacheIndex } from './database/ScopedCacheIndex.js';

/**
 * The one way cache entries are deleted: always the row first, then its file.
 * A file whose deletion fails is only an orphan, which the verify job removes, so file errors are logged, not thrown.
 * @internal
 */
@singleton()
export class CacheEntryDeleter {
  constructor(
    private readonly cacheFileStorage: CacheFileStorage,
  ) {
  }

  /** Deletes the entry only if no write replaced it since it was read, so a concurrent overwrite survives */
  async deleteEntry(index: ScopedCacheIndex, row: CacheIndexRow): Promise<void> {
    if (await index.deleteExact(row)) {
      await this.deleteFilesOf([row]);
    }
  }

  /** For rows a bulk `DELETE … RETURNING` already removed, or whose file a committed overwrite replaced */
  async deleteFilesOf(rows: readonly DeletedCacheRow[]): Promise<void> {
    for (const row of rows) {
      if (row.fileId != null) {
        await this.deleteFile(row, row.fileId);
      }
    }
  }

  private async deleteFile(row: DeletedCacheRow, fileId: string): Promise<void> {
    try {
      await this.cacheFileStorage.deleteFile({
        userId: row.userId,
        namespace: row.namespace,
        version: row.version,
        fileId,
      });
    } catch (err) {
      console.warn(`[WARN] Could not delete cache file ${row.namespace}@${row.version}/${fileId} – leaving it to the verify job:`, err);
    }
  }
}
