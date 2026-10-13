import type { CacheIndexRow } from './CacheIndexRow.js';
import type { CacheIndexWrite } from './CacheIndexWrite.js';

/** @internal */
export interface ScopedCacheIndex {
  find(namespace: string, version: number, key: string): Promise<CacheIndexRow | null>;

  upsertReturningPrevious(write: CacheIndexWrite): Promise<{ previousFileId: string | null }>; // one transaction

  /**
   * WHERE id AND file_id AND created_at [AND user_id]; true if deleted.
   * created_at tells writes apart that file_id cannot (a cached null overwritten by another one).
   */
  deleteExact(row: CacheIndexRow): Promise<boolean>;

  touch(id: bigint): Promise<void>;
}
