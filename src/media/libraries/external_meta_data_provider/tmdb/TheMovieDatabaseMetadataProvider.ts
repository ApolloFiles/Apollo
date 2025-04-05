import { StringUtils } from '@spraxdev/node-commons';
import { MetaProvider } from '../../scan/analyser/DirectoryAnalyser';
import MetadataProvider, { TitleMetaData } from '../MetadataProvider';
import TheMovieDatabaseApiClient, { MovieDbMovie, MovieDbTv } from './TheMovieDatabaseApiClient';

export default class TheMovieDatabaseMetadataProvider extends MetadataProvider {
  private readonly apiReadAccessToken: string;
  private readonly theMovieDatabaseClient: TheMovieDatabaseApiClient;

  constructor(apiReadAccessToken: string) {
    super();

    this.apiReadAccessToken = apiReadAccessToken;
    this.theMovieDatabaseClient = new TheMovieDatabaseApiClient(apiReadAccessToken);
  }

  isAvailable(): boolean {
    return this.apiReadAccessToken != '';
  }

  async fetchByMetaProvider(metaProvider: MetaProvider): Promise<TitleMetaData | null> {
    if (metaProvider.providerId === 'tmdb') {
      const mediaId = this.parseMediaId(metaProvider.mediaId);

      if (mediaId.mediaType === 'movie') {
        return this.convertToTitleMetaData(await this.theMovieDatabaseClient.fetchMovieById(mediaId.id));
      }
      if (mediaId.mediaType === 'tv') {
        return this.convertToTitleMetaData(await this.theMovieDatabaseClient.fetchTvSeriesById(mediaId.id));
      }

      throw new Error(`Unknown/Unsupported mediaType '${mediaId.mediaType}' for TheMovieDatabase (expected 'movie' or 'tv'): ${metaProvider.mediaId}`);
    }

    if (metaProvider.providerId === 'imdb') {
      const movie = await this.theMovieDatabaseClient.fetchMovieByExternalId(metaProvider.mediaId, 'imdb_id');
      if (movie != null) {
        return this.convertToTitleMetaData(movie);
      }

      const tvShow = await this.theMovieDatabaseClient.fetchTvSeriesByExternalId(metaProvider.mediaId, 'imdb_id');
      return this.convertToTitleMetaData(tvShow);
    }

    throw new Error(`Unknown/Unsupported providerId for TheMovieDatabaseMetadataProvider (expected 'tmdb'): ${metaProvider.mediaId}`);
  }

  private convertToTitleMetaData(response: MovieDbMovie | MovieDbTv | null): TitleMetaData | null {
    if (response == null) {
      return null;
    }

    const dateToExtractYearFrom = 'releaseDate' in response ? response.releaseDate : response.firstAirDate;
    return {
      id: response.id,
      title: response.title,
      synopsis: response.overview,

      hasPosterImage: response.posterPath != null,
      fetchPosterImage: async () => {
        if (response.posterPath == null) {
          return null;
        }
        return this.theMovieDatabaseClient.fetchImage(response.posterPath);
      },

      year: dateToExtractYearFrom != null ? parseInt(dateToExtractYearFrom.substring(0, 4), 10) : null,
      genres: response.genres.map((genre) => genre.name) ?? [],
    };
  }

  private parseMediaId(mediaId: string): { mediaType: 'movie' | 'tv', id: number } {
    const indexOfUnderscore = mediaId.indexOf('_');
    if (indexOfUnderscore === -1) {
      throw new Error(`Invalid mediaId for TheMovieDatabase: ${mediaId}`);
    }

    const mediaType = mediaId.substring(0, indexOfUnderscore);
    const idStr = mediaId.substring(indexOfUnderscore + 1);
    const id = parseInt(idStr, 10);

    if (mediaType !== 'movie' && mediaType !== 'tv') {
      throw new Error(`Invalid mediaId (format of \${mediaType}_\${id}) for TheMovieDatabase (mediaType needs to be 'movie' or 'tv'): ${mediaId}`);
    }
    if (!StringUtils.isNumeric(idStr) || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Invalid mediaId (format of \${mediaType}_\${id}) for TheMovieDatabase (id needs to be a positive integer): ${mediaId}`);
    }

    return {
      mediaType: mediaType,
      id,
    };
  }
}
