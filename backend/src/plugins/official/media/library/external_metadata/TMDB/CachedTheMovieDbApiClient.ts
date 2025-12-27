import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import ExpiringApolloCache, { type CachePath } from '../../../../../../files/cache/global/ExpiringApolloCache.js';
import TheMovieDbApiClient from './TheMovieDbApiClient.js';
import type {
  ExternalIdSource,
  FindByExternalIdResult,
  TheMovieDbApiClientInterface,
} from './TheMovieDbApiClientInterface.js';
import {
  CONFIGURATION_RESPONSE_SCHEMA,
  FULL_MOVIE_DETAILS_RESPONSE_SCHEMA,
  FULL_TV_SERIES_DETAILS_RESPONSE_SCHEMA,
  type TMDBApiConfiguration,
  type TMDBMovieDetails,
  type TMDBTvSeriesDetails,
} from './TMDBApiResponseSchemas.js';

@singleton()
export default class CachedTheMovieDbApiClient implements TheMovieDbApiClientInterface {
  private static readonly CACHE_ID_PREFIX = 'themoviedb_api';

  constructor(
    private readonly theMovieDbApiClient: TheMovieDbApiClient,
    private readonly expiringApolloCache: ExpiringApolloCache,
  ) {
  }

  async findMovieById(movieId: number): Promise<TMDBMovieDetails> {
    const cacheIdentifier = `movie/${movieId}`;

    const cachedValue = await this.tryReadCachedJson(cacheIdentifier, FULL_MOVIE_DETAILS_RESPONSE_SCHEMA);
    if (cachedValue != null) {
      return cachedValue;
    }

    const movieDetails = await this.theMovieDbApiClient.findMovieById(movieId);
    await this.writeApiResponseCache(cacheIdentifier, JSON.stringify(movieDetails));
    return movieDetails;
  }

  async findTvSeriesById(seriesId: number): Promise<TMDBTvSeriesDetails> {
    const cacheIdentifier = `tv/${seriesId}`;

    const cachedValue = await this.tryReadCachedJson(cacheIdentifier, FULL_TV_SERIES_DETAILS_RESPONSE_SCHEMA);
    if (cachedValue != null) {
      return cachedValue;
    }

    const tvSeriesDetails = await this.theMovieDbApiClient.findTvSeriesById(seriesId);
    await this.writeApiResponseCache(cacheIdentifier, JSON.stringify(tvSeriesDetails));
    return tvSeriesDetails;
  }

  // TODO: Implement a somewhat smart caching strategy for this as well
  findOneByExternalId(externalId: string, externalSource: ExternalIdSource): Promise<FindByExternalIdResult> {
    return this.theMovieDbApiClient.findOneByExternalId(externalId, externalSource);
  }

  async fetchImage(imagePath: string): Promise<Buffer> {
    const cacheIdentifier = `image_${imagePath}`;

    const cachePath = await this.getCache(cacheIdentifier);
    if (cachePath != null) {
      try {
        return await Fs.promises.readFile(cachePath.path);
      } catch (err) {
        console.error('Error reading cached TheMovieDB Image, deleting cache and refetching:', err);
        await this.deleteCache(cacheIdentifier);
      }
    }

    const imageBytes = await this.theMovieDbApiClient.fetchImage(imagePath, await this.fetchApiConfiguration());
    await this.writeCache(cacheIdentifier, ExpiringApolloCache.TTL_ONE_WEEK, imageBytes);
    return imageBytes;
  }

  async fetchApiConfiguration(): Promise<TMDBApiConfiguration> {
    const cacheIdentifier = 'api_configuration';

    const cachedValue = await this.tryReadCachedJson(cacheIdentifier, CONFIGURATION_RESPONSE_SCHEMA);
    if (cachedValue != null) {
      return cachedValue;
    }

    const apiConfiguration = await this.theMovieDbApiClient.fetchApiConfiguration();
    await this.writeCache(cacheIdentifier, ExpiringApolloCache.TTL_ONE_DAY, JSON.stringify(apiConfiguration));
    return apiConfiguration;
  }

  private async tryReadCachedJson<T>(identifier: string, schema: { parse(input: any): T }): Promise<T | null> {
    const cachePath = await this.getCache(identifier);
    if (cachePath != null) {
      try {
        return schema.parse(JSON.parse(await Fs.promises.readFile(cachePath.path, 'utf-8')));
      } catch (err) {
        console.error('Error parsing cached TheMovieDB-API response, deleting cache and refetching:', err);
        await this.deleteCache(identifier);
      }
    }

    return null;
  }

  private writeApiResponseCache(identifier: string, data: string): Promise<void> {
    return this.writeCache(identifier, ExpiringApolloCache.TTL_ONE_HOUR, data);
  }

  private getCache(identifier: string): Promise<CachePath | null> {
    return this.expiringApolloCache.get(CachedTheMovieDbApiClient.CACHE_ID_PREFIX, identifier);
  }

  private deleteCache(identifier: string): Promise<void> {
    return this.expiringApolloCache.delete(CachedTheMovieDbApiClient.CACHE_ID_PREFIX, identifier);
  }

  private async writeCache(identifier: string, ttl: number, data: string | Buffer): Promise<void> {
    const cachePath = await this.expiringApolloCache.createOrUpdateTtl(
      CachedTheMovieDbApiClient.CACHE_ID_PREFIX,
      identifier,
      ttl,
    );

    await Fs.promises.writeFile(cachePath.path, data);
  }
}
