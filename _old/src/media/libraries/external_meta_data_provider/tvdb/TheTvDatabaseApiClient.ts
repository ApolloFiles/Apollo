import { HttpResponse, StringUtils } from '@spraxdev/node-commons';
import { getHttpClient } from '../../../../Constants';

interface TvDbEntry {
  id: number;

  name: string;
  overview: string | null;
  nameTranslations: string[];
  overviewTranslations: string[];

  image: string | null;
  year: number | null;
  genres: string[];
  remoteIds: { id: string; type: number; sourceName: string }[];

  originalCountry: string | null;
  originalLanguage: string | null;
}

export type TvDbSeries = TvDbEntry;
export type TvDbMovie = TvDbEntry;

export class TheTvDatabaseApiClient {
  private readonly BASE_URL = 'https://api4.thetvdb.com/v4';
  private readonly BEARER_TOKEN_MAX_AGE = 20n * 24n * 60n * 60n * 1_000_000n * 1_000n;  // 20 days

  private readonly apiKey: string;

  private bearerToken: string | null = null;
  private bearerTokenExpiresAt = 0n;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchSeriesById(id: number): Promise<TvDbSeries | null> {
    const seriesRes = await this.fetchApiUrl(`${this.BASE_URL}/series/${id}`);
    if (seriesRes.status === 404) {
      return null;
    }
    if (seriesRes.status !== 200) {
      throw new Error('Failed to fetch series from TheTvDatabase API (Status ' + seriesRes.status + '): ' + seriesRes.body.toString());
    }

    return this.parseAsSimpleEntry(JSON.parse(seriesRes.body.toString()).data);
  }

  async fetchMovieById(id: number): Promise<TvDbMovie | null> {
    const movieRes = await this.fetchApiUrl(`${this.BASE_URL}/movies/${id}/extended?meta=translations&short=true`);
    if (movieRes.status === 404) {
      return null;
    }
    if (movieRes.status !== 200) {
      throw new Error('Failed to fetch movie from TheTvDatabase API (Status ' + movieRes.status + '): ' + movieRes.body.toString());
    }

    return this.parseAsSimpleEntry(JSON.parse(movieRes.body.toString()).data);
  }

  private parseAsSimpleEntry(value: any): TvDbEntry {
    const yearStr = this.parseAsStringOptional(value.year);
    if (yearStr != null && !StringUtils.isNumeric(yearStr)) {
      throw new Error(`Expected year to be numeric, got: ${yearStr}`);
    }

    const overview = [
      value.overview,
      (value.translations?.overviewTranslations as any[])?.find(t => t.language === 'deu')?.overview,
      (value.translations?.overviewTranslations as any[])?.find(t => t.language === 'eng')?.overview,
      (value.translations?.overviewTranslations as any[])?.find(t => t.isPrimary)?.overview,
    ].find(o => o != null && o !== '') ?? null;

    return {
      id: this.parseAsNumber(value.id),

      name: this.parseAsString(value.name),
      overview: this.parseAsStringOptional(overview),
      nameTranslations: value.nameTranslations,
      overviewTranslations: value.overviewTranslations,

      image: this.parseAsStringOptional(value.image),
      year: yearStr == null ? null : parseInt(yearStr, 10),
      genres: value.genres?.map((genre: any) => this.parseAsString(genre.name)) ?? [],
      remoteIds: value.remoteIds ?? [],

      originalCountry: this.parseAsStringOptional(value.originalCountry),
      originalLanguage: this.parseAsStringOptional(value.originalLanguage),
    };
  }

  private async fetchApiUrl(apiUrl: string): Promise<HttpResponse> {
    if (process.hrtime.bigint() >= this.bearerTokenExpiresAt) {
      await this.login();
    }

    return getHttpClient().get(apiUrl, {
      Accept: 'application/json',
      Authorization: `Bearer ${this.bearerToken}`,
    });
  }

  private async login(): Promise<void> {
    const loginRes = await getHttpClient().post(`${this.BASE_URL}/login`, {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }, { apikey: this.apiKey });

    if (loginRes.status !== 200) {
      throw new Error('Failed to login to the TheTvDatabase API: ' + loginRes.body.toString());
    }

    const body = JSON.parse(loginRes.body.toString());
    const token = body.data?.token;
    if (typeof token !== 'string') {
      throw new Error('Invalid token received from TheTvDatabase API: ' + loginRes.body.toString());
    }

    this.bearerToken = body.data.token;
    this.bearerTokenExpiresAt = process.hrtime.bigint() + this.BEARER_TOKEN_MAX_AGE;
  }

  private parseAsNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    throw new Error(`Expected number, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseAsString(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    throw new Error(`Expected string, got ${typeof value}: ${JSON.stringify(value)}`);
  }

  private parseAsStringOptional(value: any): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string') {
      return value === '' ? null : value;
    }

    throw new Error(`Expected string or null, got ${typeof value}: ${JSON.stringify(value)}`);
  }
}
