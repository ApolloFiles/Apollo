import type { CachedNull } from '../../CacheEntry.js';

/** @internal */
export class NullCacheEntry implements CachedNull {
  public readonly etag = null;
  public readonly isNull = true;

  constructor(
    public readonly isStale: boolean,
    public readonly createdAt: Date,
  ) {
  }

  value(): Promise<null> {
    return Promise.resolve(null);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // no-op
  }
}
