/** @internal */
export interface CacheIndexWrite {
  readonly namespace: string;
  readonly version: number;
  readonly key: string;
  readonly groupKey: string | null;
  readonly validator: string | null;
  readonly payload: CacheIndexPayload | null;
  readonly writtenAt: Date;
  readonly freshUntil: Date | null;
  readonly keepUntil: Date | null;
}

/** @internal */
export interface CacheIndexPayload {
  readonly fileId: string;
  readonly sizeBytes: number;
  readonly contentType: string | null;
}

/** @internal */
export function toCacheIndexColumns(write: CacheIndexWrite) {
  return {
    groupKey: write.groupKey,
    validator: write.validator,
    isNull: write.payload == null,
    fileId: write.payload?.fileId ?? null,
    sizeBytes: write.payload?.sizeBytes ?? 0,
    contentType: write.payload?.contentType ?? null,
    createdAt: write.writtenAt,
    lastAccessedAt: write.writtenAt,
    freshUntil: write.freshUntil,
    keepUntil: write.keepUntil,
  };
}
