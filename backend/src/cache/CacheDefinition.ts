import type { CacheCodec } from './CacheCodec.js';
import { type CacheExpiry, ensureValidCacheExpiry } from './CacheExpiry.js';

const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export interface CacheDefinition<T> {
  /** Matches `^[a-z0-9][a-z0-9._-]{0,99}$` */
  readonly namespace: string;
  /**
   * Can be used to "version" a give cache – e.g. when code changes cause the already cached data to be deemed outdated
   * (e.g. resolution of generated thumbnails changed)
   *
   * Needs to be a positive integer
   */
  readonly version: number;

  readonly expiry: CacheExpiry;
  /** When do `null` values expire? Defaults to the value of `expiry`. */
  readonly nullExpiry?: CacheExpiry;

  /** @see import('./CacheCodec.js').CacheCodecs */
  readonly codec: CacheCodec<NonNullable<T>>;
  /** A valid `Content-Type` header value (e.g. a mime type like `image/png`; might also carry parameters like `text/plain; charset=utf-8`) */
  readonly contentType?: string;
}

/** @internal */
export function validateCacheDefinition<T>(definition: CacheDefinition<T>): void {
  if (!NAMESPACE_PATTERN.test(definition.namespace)) {
    throw new Error(`Invalid cache namespace '${definition.namespace}': it must match ${NAMESPACE_PATTERN}`);
  }
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new Error(`Invalid version ${definition.version} for cache namespace '${definition.namespace}': it must be a positive integer`);
  }

  ensureValidCacheExpiry(definition.expiry, `the cache namespace '${definition.namespace}'`);
  if (definition.nullExpiry != null) {
    ensureValidCacheExpiry(definition.nullExpiry, `the nulls of cache namespace '${definition.namespace}'`);
  }
}
