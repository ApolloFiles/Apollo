import type { CacheExpiry } from './CacheExpiry.js';

/**
 * Produces the value to cache. Caching `null` as a value is explicitly possible (e.g. to represent a 404 API response).
 *
 * Tools that write to a file themselves (e.g. ffmpeg) can write to {@link CacheFactoryContext.tempPath} instead and
 * return {@link CacheFactoryContext.fromTempFile}'s result; the file is stored as-is, so it must already be in the codec's encoded form.
 */
export type CacheFactory<T> = (context: CacheFactoryContext) => Promise<T | TempFileWritten>;

interface CacheFactoryContext {
  readonly tempPath: string;

  fromTempFile(): TempFileWritten;
}

export interface CacheWriteOptions {
  expiry?: CacheExpiry,
  nullExpiry?: CacheExpiry,
  contentType?: string,
}

export interface CacheGetOrCreateOptions extends CacheWriteOptions {
  serveStaleOnError?: boolean | ((error: unknown) => boolean),
}

export interface UserCacheWriteOptions extends CacheWriteOptions {
  groupKey?: string,
}

export interface UserCacheGetOrCreateOptions extends CacheGetOrCreateOptions {
  groupKey?: string,
}

export class TempFileWritten {
  private constructor() {
  }

  /** @internal */
  static create(): TempFileWritten {
    return new TempFileWritten();
  }
}
