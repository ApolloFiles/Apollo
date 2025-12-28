import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../../../config/ApolloDirectoryProvider.js';
import ApolloCacheProvider from './ApolloCacheProvider.js';

type CacheMetadata = {
  expiryTimestampMillis: number,
  creationTimestampMillis: number,
}
export type CachePath = {
  path: string,
  metadata: CacheMetadata,
}

// TODO: Maybe the concept of a CacheItem makes sense, that encapsulates read, write, stat etc.?
//       We can always return a CacheItem and it exposed methods to manage itself
/**
 * @deprecated Use an {@link SimpleCacheInterface} implementation instead
 */
@singleton()
export default class ExpiringApolloCache {
  public static readonly TTL_INFINITE = 0 as const;
  public static readonly TTL_ONE_HOUR = 3600 as const;
  public static readonly TTL_ONE_DAY = 86_400 as const;
  public static readonly TTL_ONE_WEEK = 604_800 as const;
  public static readonly TTL_ONE_MONTH = 2_592_000 as const;

  private readonly apolloCacheProvider: ApolloCacheProvider;

  constructor(
    apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
    this.apolloCacheProvider = new ApolloCacheProvider(apolloDirectoryProvider, 'expiring');
  }

  async get(idPrefix: string, identifier: string): Promise<CachePath | null> {
    const cachePaths = await this.determinePaths(idPrefix, identifier);
    const cacheMetadata = await this.stat(idPrefix, identifier);

    if (cacheMetadata != null) {
      return {
        path: cachePaths.data,
        metadata: cacheMetadata,
      };
    }
    return null;
  }

  async delete(idPrefix: string, identifier: string): Promise<void> {
    const paths = await this.determinePaths(idPrefix, identifier);
    await Fs.promises.rm(paths.base, { recursive: true, force: true });
  }

  async createOrUpdateTtl(idPrefix: string, identifier: string, ttlSeconds: number): Promise<CachePath> {
    const cachePaths = await this.determinePaths(idPrefix, identifier);

    let cacheMetadata = await this.stat(idPrefix, identifier);

    if (cacheMetadata != null && cacheMetadata.expiryTimestampMillis > 0) {
      cacheMetadata.expiryTimestampMillis = ttlSeconds * 60 * 1000;
      await this.writeMetadataFile(cachePaths.metadata, cacheMetadata);
    }

    if (cacheMetadata == null) {
      cacheMetadata = {
        expiryTimestampMillis: ttlSeconds > 0 ? Date.now() + (ttlSeconds * 1000) : 0,
        creationTimestampMillis: Date.now(),
      };

      await Fs.promises.mkdir(cachePaths.base, { recursive: true });
      await this.writeMetadataFile(cachePaths.metadata, cacheMetadata);
    }

    return {
      path: cachePaths.data,
      metadata: cacheMetadata,
    };
  }

  async stat(idPrefix: string, identifier: string): Promise<CacheMetadata | null> {
    const cachePaths = await this.determinePaths(idPrefix, identifier);

    const cacheMetadata = await this.optionallyReadMetadataFile(cachePaths.metadata);

    if (cacheMetadata != null && this.hasExpired(cacheMetadata)) {
      await this.delete(idPrefix, identifier);
      return null;
    }

    return cacheMetadata;
  }

  private hasExpired(metadata: CacheMetadata): boolean {
    return metadata.expiryTimestampMillis > 0 && Date.now() >= metadata.expiryTimestampMillis;
  }

  private async writeMetadataFile(metadataPath: string, metadata: CacheMetadata): Promise<void> {
    const rawMetadata = [
      metadata.expiryTimestampMillis,
      metadata.creationTimestampMillis,
    ].join('\n');

    await Fs.promises.writeFile(metadataPath, rawMetadata + '\n');
  }

  private async optionallyReadMetadataFile(metadataPath: string): Promise<CacheMetadata | null> {
    let rawMetadata;
    try {
      rawMetadata = await Fs.promises.readFile(metadataPath, 'utf-8');
    } catch (err) {
      if (err instanceof Error && (err as any).code === 'ENOENT') {
        return null;
      }

      throw err;
    }

    const [expiryTimestamp, creationTimestamp] = rawMetadata.split('\n');
    return {
      expiryTimestampMillis: parseInt(expiryTimestamp, 10),
      creationTimestampMillis: parseInt(creationTimestamp, 10),
    };
  }

  private async determinePaths(idPrefix: string, identifier: string): Promise<{
    base: string,
    metadata: string,
    data: string,
  }> {
    const base = await this.apolloCacheProvider.getCachePath(idPrefix, identifier);
    return {
      base,
      metadata: Path.join(base, 'metadata'),
      data: Path.join(base, 'data'),
    };
  }
}
