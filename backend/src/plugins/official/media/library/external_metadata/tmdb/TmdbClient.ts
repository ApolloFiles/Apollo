import { singleton } from 'tsyringe';
import { type FindByExternalIdData, TmdbFindByExternalIdCache } from './cache/TmdbFindByExternalIdCache.js';
import { TmdbImageCache } from './cache/TmdbImageCache.js';
import { TmdbMovieCache } from './cache/TmdbMovieCache.js';
import { TmdbTvSeriesCache } from './cache/TmdbTvSeriesCache.js';
import { TmdbError } from './errors/TmdbError.js';
import { TmdbErrorClassifier } from './errors/TmdbErrorClassifier.js';
import { ImageFetcher } from './fetching/ImageFetcher.js';
import { FIND_BY_EXTERNAL_ID_SCHEMA } from './schema/FindByExternalIdSchema.js';
import { MOVIE_DETAILS_WITH_EXTRAS_SCHEMA, type MovieDetailsWithExtras } from './schema/MovieSchema.js';
import { TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA, type TvSeriesDetailsWithExtras } from './schema/TvSeriesSchema.js';
import { TmdbHttpTransport } from './transport/TmdbHttpTransport.js';

export type ExternalIdSource =
  | 'imdb_id'
  | 'facebook_id'
  | 'instagram_id'
  | 'tvdb_id'
  | 'tiktok_id'
  | 'twitter_id'
  | 'wikidata_id'
  | 'youtube_id';
export type TmdbMovie = MovieDetailsWithExtras;
export type TmdbTvSeries = TvSeriesDetailsWithExtras;
export type FindByExternalIdResult = { type: 'tv', details: TmdbTvSeries } |
                                     { type: 'movie', details: TmdbMovie } |
                                     null;

@singleton()
export class TmdbClient {
  private static readonly FILE_PATH_PATTERN = /^\/[a-z0-9]+\.[a-z]+$/i;

  constructor(
    private readonly movieCache: TmdbMovieCache,
    private readonly tvSeriesCache: TmdbTvSeriesCache,
    private readonly imageCache: TmdbImageCache,
    private readonly findByExternalIdCache: TmdbFindByExternalIdCache,
    private readonly httpTransport: TmdbHttpTransport,
    private readonly imageFetcher: ImageFetcher,
  ) {
  }

  async fetchMovie(movieId: number): Promise<TmdbMovie | null> {
    if (!this.looksLikeValidId(movieId)) {
      throw new TmdbError(`The movieId has to be positive, got ${JSON.stringify(movieId)}`);
    }

    const cacheEntry = await this.movieCache.getOrCreate(
      movieId.toString(),
      () => this.httpTransport.fetchJson(
        `/movie/${movieId}`,
        MOVIE_DETAILS_WITH_EXTRAS_SCHEMA,
        { append_to_response: 'external_ids,alternative_titles,images,translations' },
      ),
      { serveStaleOnError: TmdbErrorClassifier.isTransient },
    );
    return cacheEntry.value();
  }

  async fetchTvSeries(seriesId: number): Promise<TmdbTvSeries | null> {
    if (!this.looksLikeValidId(seriesId)) {
      throw new TmdbError(`The seriesId has to be positive, got ${JSON.stringify(seriesId)}`);
    }

    const cacheEntry = await this.tvSeriesCache.getOrCreate(
      seriesId.toString(),
      () => this.httpTransport.fetchJson(
        `/tv/${seriesId}`,
        TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA,
        { append_to_response: 'external_ids,alternative_titles,images,translations' },
      ),
      { serveStaleOnError: TmdbErrorClassifier.isTransient },
    );
    return cacheEntry.value();
  }

  async findOneByExternalId(externalId: string, externalSource: ExternalIdSource): Promise<FindByExternalIdResult> {
    if (externalId.trim() === '') {
      throw new TmdbError(`The externalId must not be empty (external source: ${externalSource})`);
    }

    const cacheEntry = await this.findByExternalIdCache.getOrCreate(
      `${externalSource}:${externalId}`,
      () => this.fetchFindByExternalIdData(externalId, externalSource),
      { serveStaleOnError: TmdbErrorClassifier.isTransient },
    );
    return this.fetchFoundDetails(await cacheEntry.value());
  }

  async fetchImage(filePath: string): Promise<Buffer | null> {
    if (!TmdbClient.FILE_PATH_PATTERN.test(filePath)) {
      throw new TmdbError(`The filePath ${JSON.stringify(filePath)} looks invalid`);
    }

    const cacheEntry = await this.imageCache.getOrCreate(filePath, () => this.imageFetcher.fetchImage(filePath));
    return cacheEntry.value();
  }

  private async fetchFindByExternalIdData(externalId: string, externalSource: ExternalIdSource): Promise<FindByExternalIdData | null> {
    const findResult = await this.httpTransport.fetchJson(
      `/find/${encodeURIComponent(externalId)}`,
      FIND_BY_EXTERNAL_ID_SCHEMA,
      { external_source: externalSource },
    );
    if (findResult == null) {
      throw new TmdbError(`TMDB responded with 404 Not Found when looking up the ${externalSource} ${JSON.stringify(externalId)}, which is not expected`);
    }

    const resultCount = findResult.movie_results.length + findResult.tv_results.length;
    if (resultCount === 0) {
      return null;
    }
    if (resultCount > 1) {
      console.warn(`[TMDB] The ${externalSource} ${JSON.stringify(externalId)} matches ${resultCount} movies and TV series, so none of them are used: ${JSON.stringify(findResult)}`);
      return null;
    }

    if (findResult.movie_results.length === 1) {
      return { type: 'movie', id: findResult.movie_results[0].id };
    }
    return { type: 'tv', id: findResult.tv_results[0].id };
  }

  private async fetchFoundDetails(found: FindByExternalIdData | null): Promise<FindByExternalIdResult> {
    if (found == null) {
      return null;
    }

    if (found.type === 'movie') {
      const details = await this.fetchMovie(found.id);
      return details == null ? null : { type: 'movie', details };
    }

    const details = await this.fetchTvSeries(found.id);
    return details == null ? null : { type: 'tv', details };
  }

  private looksLikeValidId(id: number): boolean {
    return Number.isInteger(id) && id > 0;
  }
}
