import { TimeUnit } from '@spraxdev/node-commons/util';

/** @see {@link import('@spraxdev/node-commons/util').TimeUnit} for convenience */
export type CacheExpiry = { freshMs: number, staleMs?: number } | 'never';

/** @internal */
export function toExpiryDates(now: Date, expiry: CacheExpiry): { freshUntil: Date | null, keepUntil: Date | null } {
  if (expiry === 'never') {
    return { freshUntil: null, keepUntil: null };
  }

  const freshUntil = new Date(now.getTime() + expiry.freshMs);
  const keepUntil = new Date(freshUntil.getTime() + (expiry.staleMs ?? 0));
  return { freshUntil, keepUntil };
}

/**
 * An entry that expires within a second would already be expired when read right after being stored
 * @internal
 */
export function ensureValidCacheExpiry(expiry: CacheExpiry, context: string): void {
  if (expiry === 'never') {
    return;
  }

  const { freshMs, staleMs = 0 } = expiry;
  if (!(freshMs >= 0 && staleMs >= 0 && freshMs + staleMs >= TimeUnit.SECONDS.toMillis(1))) {
    throw new Error(`Invalid cache expiry ${JSON.stringify(expiry)} for ${context}: it must not be negative and keep entries for at least a second`);
  }
}
