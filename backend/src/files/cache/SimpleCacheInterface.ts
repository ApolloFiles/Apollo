export type CacheValue = number | boolean | string | null;
export type OptionallyPromise<T> = T | Promise<T>;

export type CacheItem<T> = {
  value: T,
  createdAt: number,
  expiresAt: number | null,
}

export const TTL_INFINITE = 0 as const;
export const TTL_ONE_HOUR = 3600 as const;
export const TTL_ONE_DAY = 86_400 as const;
export const TTL_ONE_WEEK = 604_800 as const;
export const TTL_ONE_MONTH = 2_592_000 as const;

export default interface SimpleCacheInterface<T = CacheValue> {
  get(key: string): OptionallyPromise<Readonly<CacheItem<T>> | null>;

  set(key: string, value: T, ttlInSeconds?: number): OptionallyPromise<void>;

  has(key: string): OptionallyPromise<boolean>;

  delete(key: string): OptionallyPromise<void>;

  clear(): OptionallyPromise<void>;
}
