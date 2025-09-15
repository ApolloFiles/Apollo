import { HttpResponse } from '@spraxdev/node-commons';
import { getHttpClient } from '../../../../Constants';

interface MovieDbSimpleEntry {
  id: number;
  imdbId: string | null;

  posterPath: string | null;
  backdropPath: string | null;

  title: string;
  originalTitle: string | null;
  originalLanguage: string | null;
  overview: string | null;

  homepage: string | null;
  adult: boolean;

  genres: { id: number, name: string }[];
}

export interface MovieDbMovie extends MovieDbSimpleEntry {
  releaseDate: string | null;
  belongsToCollection: { id: number, name: string, posterPath: string | null, backdropPath: string | null } | null;
}

export interface MovieDbTv extends MovieDbSimpleEntry {
  numberOfSeasons: number;
  numberOfEpisodes: number;

  firstAirDate: string | null;
  lastAirDate: string | null;
}

export type ExternalId = 'imdb_id' | 'tvdb_id' | 'wikidata_id';

type MovieDbDetailsConfiguration = {
  readonly images: {
    readonly secure_base_url: string;
    readonly backdrop_sizes: string[];
    readonly logo_sizes: string[];
    readonly poster_sizes: string[];
    readonly profile_sizes: string[];
    readonly still_sizes: string[];
  };
  readonly  change_keys: string[];
};

export default class TheMovieDatabaseApiClient {
  private readonly apiReadAccessToken: string;
  private detailsConfiguration: MovieDbDetailsConfiguration | null = null;

  constructor(apiReadAccessToken: string) {
    this.apiReadAccessToken = apiReadAccessToken;
  }

  async fetchMovieById(id: number, language?: string): Promise<MovieDbMovie | null> {
    const apiRes = await this.fetchApiUrl(`https://api.themoviedb.org/3/movie/${id}${language != null ? `?language=${encodeURIComponent(language)}` : ''}`);

    if (apiRes.status === 404) {
      return null;
    }
    if (apiRes.status === 200) {
      return this.parseAsMovie(JSON.parse(apiRes.body.toString('utf-8')));
    }

    throw new Error(`Got status '${apiRes.status}' from TheMovieDatabase API: ${apiRes.body.toString('utf-8')}`);
  }

  async fetchMovieByExternalId(externalId: string, externalSource: ExternalId, language?: string): Promise<MovieDbMovie | null> {
    const apiRes = await this.fetchApiUrl(`https://api.themoviedb.org/3/find/${encodeURIComponent(externalId)}?external_source=${externalSource}${language != null ? `&language=${encodeURIComponent(language)}` : ''}`);

    if (apiRes.status === 404) {
      return null;
    }
    if (apiRes.status === 200) {
      const response = JSON.parse(apiRes.body.toString('utf-8'));
      if (response.movie_results.length > 0) {
        return this.parseAsMovie(response.movie_results[0]);
      }
    }

    throw new Error(`Got status '${apiRes.status}' from TheMovieDatabase API: ${apiRes.body.toString('utf-8')}`);
  }

  async fetchTvSeriesById(id: number, language?: string): Promise<MovieDbTv | null> {
    const apiRes = await this.fetchApiUrl(`https://api.themoviedb.org/3/tv/${id}${language != null ? `?language=${encodeURIComponent(language)}` : ''}`);

    if (apiRes.status === 404) {
      return null;
    }
    if (apiRes.status === 200) {
      return this.parseAsTvSeries(JSON.parse(apiRes.body.toString('utf-8')));
    }

    throw new Error(`Got status '${apiRes.status}' from TheMovieDatabase API: ${apiRes.body.toString('utf-8')}`);
  }

  async fetchTvSeriesByExternalId(externalId: string, externalSource: ExternalId, language?: string): Promise<MovieDbTv | null> {
    const apiRes = await this.fetchApiUrl(`https://api.themoviedb.org/3/find/${encodeURIComponent(externalId)}?external_source=${externalSource}${language != null ? `&language=${encodeURIComponent(language)}` : ''}`);

    if (apiRes.status === 404) {
      return null;
    }
    if (apiRes.status === 200) {
      const response = JSON.parse(apiRes.body.toString('utf-8'));
      if (response.tv_results.length > 0) {
        return this.parseAsTvSeries(response.tv_results[0]);
      }
    }

    throw new Error(`Got status '${apiRes.status}' from TheMovieDatabase API: ${apiRes.body.toString('utf-8')}`);
  }

  async fetchImage(imagePath: string): Promise<Buffer> {
    if (!imagePath.startsWith('/')) {
      throw new Error(`Expected imagePath to start with '/', got: ${imagePath}`);
    }

    const detailsConfiguration = await this.fetchDetailsConfiguration();
    const imageUrl = `${detailsConfiguration.images.secure_base_url}original${imagePath}`;

    const apiRes = await getHttpClient().get(imageUrl);
    if (apiRes.status === 200) {
      return apiRes.body;
    }

    throw new Error(`Got status '${apiRes.status}' from TheMovieDatabase API: ${apiRes.body.toString('utf-8')}`);
  }

  private fetchApiUrl(apiUrl: string): Promise<HttpResponse> {
    return getHttpClient().get(apiUrl, {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiReadAccessToken}`,
    });
  }

  private async fetchDetailsConfiguration(): Promise<MovieDbDetailsConfiguration> {
    if (this.detailsConfiguration == null) {
      const apiRes = await this.fetchApiUrl('https://api.themoviedb.org/3/configuration');
      if (apiRes.status !== 200) {
        throw new Error(`Got status '${apiRes.status}' from TheMovieDatabase API: ${apiRes.body.toString('utf-8')}`);
      }

      this.detailsConfiguration = JSON.parse(apiRes.body.toString('utf-8'));
    }

    return this.detailsConfiguration!;
  }

  private parseAsMovie(responseBody: any): MovieDbMovie {
    if (typeof responseBody !== 'object') {
      throw new Error(`Expected object, got ${typeof responseBody}: ${JSON.stringify(responseBody)}`);
    }

    return {
      id: this.parseNumber(responseBody.id),
      imdbId: this.parseStringOptional(responseBody.imdb_id),

      posterPath: this.parseStringOptional(responseBody.poster_path),
      backdropPath: this.parseStringOptional(responseBody.backdrop_path),

      title: this.parseString(responseBody.title),
      originalTitle: this.parseStringOptional(responseBody.original_title),
      originalLanguage: this.parseStringOptional(responseBody.original_language),
      overview: this.parseStringOptional(responseBody.overview),

      releaseDate: this.parseDateOptional(responseBody.release_date),
      homepage: this.parseStringOptional(responseBody.homepage),
      adult: this.parseBoolean(responseBody.adult),

      genres: this.parseGenres(responseBody.genres),
      belongsToCollection: this.parseCollection(responseBody.belongs_to_collection),
    };
  }

  private parseAsTvSeries(responseBody: any): MovieDbTv {
    if (typeof responseBody !== 'object') {
      throw new Error(`Expected object, got ${typeof responseBody}: ${JSON.stringify(responseBody)}`);
    }

    return {
      id: this.parseNumber(responseBody.id),
      imdbId: null,

      posterPath: this.parseStringOptional(responseBody.poster_path),
      backdropPath: this.parseStringOptional(responseBody.backdrop_path),

      title: this.parseString(responseBody.name),
      originalTitle: this.parseStringOptional(responseBody.original_name),
      originalLanguage: this.parseStringOptional(responseBody.original_language),
      overview: this.parseStringOptional(responseBody.overview),
      numberOfSeasons: this.parseNumber(responseBody.number_of_seasons),
      numberOfEpisodes: this.parseNumber(responseBody.number_of_episodes),

      firstAirDate: this.parseDateOptional(responseBody.first_air_date),
      lastAirDate: this.parseDateOptional(responseBody.last_air_date),
      homepage: this.parseStringOptional(responseBody.homepage),
      adult: this.parseBoolean(responseBody.adult),

      genres: this.parseGenres(responseBody.genres),
    };
  }

  private parseBoolean(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    throw new Error(`Expected boolean, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    throw new Error(`Expected number, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseString(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    throw new Error(`Expected string, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseStringOptional(value: any): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string') {
      return value === '' ? null : value;
    }

    throw new Error(`Expected string or null, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseDateOptional(value: any): string | null {
    const dateStr = this.parseStringOptional(value);
    if (dateStr == null) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/u.test(dateStr)) {
      throw new Error(`Expected date to be in format 'YYYY-MM-DD', got: ${dateStr}`);
    }
    return dateStr;
  }

  private parseGenres(value: any): MovieDbMovie['genres'] {
    if (value == null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((genre) => ({
        id: this.parseNumber(genre.id),
        name: this.parseString(genre.name),
      }));
    }

    throw new Error(`Expected array, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseCollection(value: any): MovieDbMovie['belongsToCollection'] {
    if (value == null) {
      return null;
    }
    if (typeof value === 'object') {
      return {
        id: this.parseNumber(value.id),
        name: this.parseString(value.name),
        posterPath: this.parseStringOptional(value.poster_path),
        backdropPath: this.parseStringOptional(value.backdrop_path),
      };
    }
    throw new Error(`Expected object or null, got ${typeof value}: ${JSON.stringify(value)}`);
  }
}
