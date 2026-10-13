/** @internal */
export interface CacheIndexRow {
  id: bigint,
  userId: string | null,
  namespace: string,
  version: number,
  key: string,
  fileId: string | null,
  isNull: boolean,
  groupKey: string | null,
  sizeBytes: number,
  contentType: string | null,
  validator: string | null,
  createdAt: Date,
  freshUntil: Date | null,
  keepUntil: Date | null,
  lastAccessedAt: Date,
}

/** @internal */
export type DeletedCacheRow = Pick<CacheIndexRow, 'userId' | 'namespace' | 'version' | 'fileId'>;
