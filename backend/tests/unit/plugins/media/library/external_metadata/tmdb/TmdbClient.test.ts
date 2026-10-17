import type { DeepMockProxy } from 'vitest-mock-extended';
import type { CacheEntry } from '#src/cache/CacheEntry.js';
import type { CacheFactory } from '#src/cache/CacheFactory.js';
import { InMemoryCacheEntry } from '#src/cache/internal/entry/InMemoryCacheEntry.js';
import { NullCacheEntry } from '#src/cache/internal/entry/NullCacheEntry.js';
import type { TmdbFindByExternalIdCache } from '#src/plugins/official/media/library/external_metadata/tmdb/cache/TmdbFindByExternalIdCache.js';
import type { TmdbImageCache } from '#src/plugins/official/media/library/external_metadata/tmdb/cache/TmdbImageCache.js';
import type { TmdbMovieCache } from '#src/plugins/official/media/library/external_metadata/tmdb/cache/TmdbMovieCache.js';
import type { TmdbTvSeriesCache } from '#src/plugins/official/media/library/external_metadata/tmdb/cache/TmdbTvSeriesCache.js';
import { TmdbError } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbError.js';
import { TmdbErrorClassifier } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbErrorClassifier.js';
import type { ImageFetcher } from '#src/plugins/official/media/library/external_metadata/tmdb/fetching/ImageFetcher.js';
import { FIND_BY_EXTERNAL_ID_SCHEMA } from '#src/plugins/official/media/library/external_metadata/tmdb/schema/FindByExternalIdSchema.js';
import { MOVIE_DETAILS_WITH_EXTRAS_SCHEMA, type MovieDetailsWithExtras } from '#src/plugins/official/media/library/external_metadata/tmdb/schema/MovieSchema.js';
import { TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA, type TvSeriesDetailsWithExtras } from '#src/plugins/official/media/library/external_metadata/tmdb/schema/TvSeriesSchema.js';
import type { TmdbHttpTransport } from '#src/plugins/official/media/library/external_metadata/tmdb/transport/TmdbHttpTransport.js';
import { TmdbClient } from '#src/plugins/official/media/library/external_metadata/tmdb/TmdbClient.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const FIGHT_CLUB = { id: 550, title: 'Fight Club' } as MovieDetailsWithExtras;
const GAME_OF_THRONES = { id: 1399, name: 'Game of Thrones' } as TvSeriesDetailsWithExtras;
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function createFindResult(movieIds: number[], tvSeriesIds: number[]): unknown {
  return {
    movie_results: movieIds.map((id) => ({ id })),
    tv_results: tvSeriesIds.map((id) => ({ id })),
    person_results: [],
    tv_episode_results: [],
    tv_season_results: [],
  };
}

const APPEND_TO_RESPONSE = { append_to_response: 'external_ids,alternative_titles,images,translations' };
const FACTORY_CONTEXT = { tempPath: '/tmp/apollo-cache/0b1f7a0e', fromTempFile: () => { throw new Error('Not expected to be used'); } };

async function runFactory<T>(factory: CacheFactory<T>): Promise<CacheEntry<T>> {
  const value = await factory(FACTORY_CONTEXT) as T;
  if (value == null) {
    return new NullCacheEntry(false, new Date()) as unknown as CacheEntry<T>;
  }
  return new InMemoryCacheEntry(Buffer.alloc(0), () => value, false, new Date(), null, null) as CacheEntry<T>;
}

function cachedEntry<T>(value: T): CacheEntry<T> {
  return new InMemoryCacheEntry(Buffer.alloc(0), () => value, false, new Date(), null, null) as CacheEntry<T>;
}

describe(TmdbClient, () => {
  let movieCache: DeepMockProxy<TmdbMovieCache>;
  let tvSeriesCache: DeepMockProxy<TmdbTvSeriesCache>;
  let imageCache: DeepMockProxy<TmdbImageCache>;
  let findByExternalIdCache: DeepMockProxy<TmdbFindByExternalIdCache>;
  let httpTransport: DeepMockProxy<TmdbHttpTransport>;
  let imageFetcher: DeepMockProxy<ImageFetcher>;
  let subject: TmdbClient;

  beforeEach(() => {
    movieCache = createStrictDeepMock<TmdbMovieCache>();
    movieCache.getOrCreate.mockImplementation(async (_key, factory) => runFactory(factory));
    tvSeriesCache = createStrictDeepMock<TmdbTvSeriesCache>();
    tvSeriesCache.getOrCreate.mockImplementation(async (_key, factory) => runFactory(factory));
    imageCache = createStrictDeepMock<TmdbImageCache>();
    imageCache.getOrCreate.mockImplementation(async (_key, factory) => runFactory(factory));
    findByExternalIdCache = createStrictDeepMock<TmdbFindByExternalIdCache>();
    findByExternalIdCache.getOrCreate.mockImplementation(async (_key, factory) => runFactory(factory));

    const responsesByPath = new Map<string, unknown>([
      ['/movie/550', FIGHT_CLUB],
      ['/tv/1399', GAME_OF_THRONES],
      ['/find/tt0137523', createFindResult([550], [])],
      ['/find/121361', createFindResult([], [1399])],
      ['/find/tt9999999999', createFindResult([], [])],
      ['/find/tt0000417', createFindResult([775], [207703])],
      ['/find/tt0000001', createFindResult([999999999], [])],
    ]);
    httpTransport = createStrictDeepMock<TmdbHttpTransport>();
    httpTransport.fetchJson.mockImplementation(async (path) => responsesByPath.get(path) ?? null);

    imageFetcher = createStrictDeepMock<ImageFetcher>();
    imageFetcher.fetchImage.mockImplementation(async (filePath) => filePath === '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg' ? JPEG_BYTES : null);

    subject = new TmdbClient(movieCache, tvSeriesCache, imageCache, findByExternalIdCache, httpTransport, imageFetcher);
  });

  describe('fetchMovie', () => {
    test('Looks the movie up in the cache by its id', async () => {
      await subject.fetchMovie(550);

      expect(movieCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('550', expect.any(Function), expect.anything());
    });

    test('Serves a stale cache entry only for failures that might go away', async () => {
      await subject.fetchMovie(550);

      expect(movieCache.getOrCreate).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.any(Function), { serveStaleOnError: TmdbErrorClassifier.isTransient });
    });

    test('Returns the cached movie without contacting TMDB', async () => {
      movieCache.getOrCreate.mockResolvedValue(cachedEntry(FIGHT_CLUB));

      await expect(subject.fetchMovie(550)).resolves.toBe(FIGHT_CLUB);

      expect(httpTransport.fetchJson).not.toHaveBeenCalled();
    });

    test('Fetches the movie with its extras from TMDB on a cache miss', async () => {
      await expect(subject.fetchMovie(550)).resolves.toBe(FIGHT_CLUB);

      expect(httpTransport.fetchJson).toHaveBeenCalledExactlyOnceWith('/movie/550', MOVIE_DETAILS_WITH_EXTRAS_SCHEMA, APPEND_TO_RESPONSE);
    });

    test('Returns null when TMDB does not know the movie', async () => {
      await expect(subject.fetchMovie(999999999)).resolves.toBeNull();
    });

    test.for([
      { movieId: 0 },
      { movieId: -550 },
      { movieId: 5.5 },
      { movieId: NaN },
      { movieId: Infinity },
    ])('Rejects the movie id $movieId without looking anywhere', async ({ movieId }) => {
      await expect(subject.fetchMovie(movieId)).rejects.toThrow(new TmdbError(`The movieId has to be positive, got ${JSON.stringify(movieId)}`));

      expect(movieCache.getOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('fetchTvSeries', () => {
    test('Looks the series up in the cache by its id', async () => {
      await subject.fetchTvSeries(1399);

      expect(tvSeriesCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('1399', expect.any(Function), expect.anything());
    });

    test('Serves a stale cache entry only for failures that might go away', async () => {
      await subject.fetchTvSeries(1399);

      expect(tvSeriesCache.getOrCreate).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.any(Function), { serveStaleOnError: TmdbErrorClassifier.isTransient });
    });

    test('Fetches the series with its extras from TMDB on a cache miss', async () => {
      await expect(subject.fetchTvSeries(1399)).resolves.toBe(GAME_OF_THRONES);

      expect(httpTransport.fetchJson).toHaveBeenCalledExactlyOnceWith('/tv/1399', TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA, APPEND_TO_RESPONSE);
    });

    test('Returns null when TMDB does not know the series', async () => {
      await expect(subject.fetchTvSeries(999999999)).resolves.toBeNull();
    });

    test.for([
      { seriesId: 0 },
      { seriesId: -1399 },
      { seriesId: 13.99 },
    ])('Rejects the series id $seriesId without looking anywhere', async ({ seriesId }) => {
      await expect(subject.fetchTvSeries(seriesId)).rejects.toThrow(new TmdbError(`The seriesId has to be positive, got ${JSON.stringify(seriesId)}`));

      expect(tvSeriesCache.getOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('findOneByExternalId', () => {
    test('Looks the match up in the cache by the external source and id', async () => {
      await subject.findOneByExternalId('tt0137523', 'imdb_id');

      expect(findByExternalIdCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('imdb_id:tt0137523', expect.any(Function), expect.anything());
    });

    test('Serves a stale cache entry only for failures that might go away', async () => {
      await subject.findOneByExternalId('tt0137523', 'imdb_id');

      expect(findByExternalIdCache.getOrCreate).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.any(Function), { serveStaleOnError: TmdbErrorClassifier.isTransient });
    });

    test('Asks TMDB for the id in the given external source', async () => {
      await subject.findOneByExternalId('tt0137523', 'imdb_id');

      expect(httpTransport.fetchJson).toHaveBeenCalledWith('/find/tt0137523', FIND_BY_EXTERNAL_ID_SCHEMA, { external_source: 'imdb_id' });
    });

    test('Encodes the external id as one path segment', async () => {
      httpTransport.fetchJson.mockResolvedValue(createFindResult([], []));

      await subject.findOneByExternalId('tt0137523/../../movie/550', 'imdb_id');

      expect(httpTransport.fetchJson).toHaveBeenCalledExactlyOnceWith('/find/tt0137523%2F..%2F..%2Fmovie%2F550', FIND_BY_EXTERNAL_ID_SCHEMA, { external_source: 'imdb_id' });
    });

    test('Returns the details of the one movie that matches', async () => {
      await expect(subject.findOneByExternalId('tt0137523', 'imdb_id')).resolves.toEqual({ type: 'movie', details: FIGHT_CLUB });
    });

    test('Returns the details of the one series that matches', async () => {
      await expect(subject.findOneByExternalId('121361', 'tvdb_id')).resolves.toEqual({ type: 'tv', details: GAME_OF_THRONES });
    });

    test('Caches only the type and id of the match', async () => {
      await subject.findOneByExternalId('tt0137523', 'imdb_id');

      const factory = findByExternalIdCache.getOrCreate.mock.calls[0][1];
      await expect(factory(FACTORY_CONTEXT)).resolves.toEqual({ type: 'movie', id: 550 });
    });

    test('Loads the details of a cached match through the series cache', async () => {
      findByExternalIdCache.getOrCreate.mockResolvedValue(cachedEntry({ type: 'tv' as const, id: 1399 }));

      await expect(subject.findOneByExternalId('121361', 'tvdb_id')).resolves.toEqual({ type: 'tv', details: GAME_OF_THRONES });

      expect(tvSeriesCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('1399', expect.any(Function), expect.anything());
    });

    test('Returns null when nothing matches', async () => {
      await expect(subject.findOneByExternalId('tt9999999999', 'imdb_id')).resolves.toBeNull();
    });

    test('Returns null when TMDB no longer knows the matched movie', async () => {
      await expect(subject.findOneByExternalId('tt0000001', 'imdb_id')).resolves.toBeNull();
    });

    describe('when a movie and a series both match', () => {
      let consoleWarn: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      });

      test('Returns null instead of guessing', async () => {
        await expect(subject.findOneByExternalId('tt0000417', 'imdb_id')).resolves.toBeNull();
      });

      test('Warns, naming the external id and the number of matches', async () => {
        await subject.findOneByExternalId('tt0000417', 'imdb_id');

        expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('The imdb_id "tt0000417" matches 2 movies and TV series'));
      });
    });

    test('Reports a 404 from TMDB, which it only sends for malformed requests', async () => {
      httpTransport.fetchJson.mockResolvedValue(null);

      await expect(subject.findOneByExternalId('tt0137523', 'imdb_id')).rejects.toThrow(TmdbError);
    });

    test.for(['', '   '])('Rejects the external id %j without looking anywhere', async (externalId) => {
      await expect(subject.findOneByExternalId(externalId, 'imdb_id')).rejects.toThrow(new TmdbError('The externalId must not be empty (external source: imdb_id)'));

      expect(findByExternalIdCache.getOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('fetchImage', () => {
    test('Looks the image up in the cache by its file path', async () => {
      await subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');

      expect(imageCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', expect.any(Function));
    });

    test('Fetches the image on a cache miss', async () => {
      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).resolves.toEqual(JPEG_BYTES);
    });

    test('Returns null when the image does not exist', async () => {
      await expect(subject.fetchImage('/doesNotExist1234567890abcde.jpg')).resolves.toBeNull();
    });

    test.for([
      { filePath: 'pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg' },
      { filePath: '/../../etc/passwd' },
      { filePath: '/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg' },
      { filePath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg?size=w500' },
      { filePath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK' },
      { filePath: '' },
    ])('Rejects the file path "$filePath" without looking anywhere', async ({ filePath }) => {
      await expect(subject.fetchImage(filePath)).rejects.toThrow(new TmdbError(`The filePath ${JSON.stringify(filePath)} looks invalid`));

      expect(imageCache.getOrCreate).not.toHaveBeenCalled();
    });
  });
});
