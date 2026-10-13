import type { Readable } from 'node:stream';

export type CacheEntry<T> = CachedValue<NonNullable<T>> | (null extends T ? CachedNull : never);

interface CacheEntryMetadata {
  readonly isStale: boolean;
  readonly createdAt: Date;
  /** A value that can be used for an ETag header */
  readonly etag: string | null;
}

export interface CachedNull extends CacheEntryMetadata, AsyncDisposable {
  readonly isNull: true;

  value(): Promise<null>;
}

export interface CachedValue<T> extends CacheEntryMetadata, AsyncDisposable {
  readonly isNull: false;
  /** A valid `Content-Type` header value */
  readonly contentType: string | null;
  readonly sizeBytes: number;

  value(): Promise<T>;
  readBuffer(): Promise<Buffer>;
  openReadStream(range?: { start: number; end: number }): Readable;
  close(): Promise<void>;
}
