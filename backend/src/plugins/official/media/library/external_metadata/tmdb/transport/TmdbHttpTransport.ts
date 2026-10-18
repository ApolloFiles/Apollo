import type { GetRequestOptions } from '@spraxdev/node-commons/http';
import { singleton } from 'tsyringe';
import type { z } from 'zod';
import AppConfiguration from '../../../../../../../config/AppConfiguration.js';
import SimpleHttpClient from '../../../../../../../http/SimpleHttpClient.js';
import { UnknownKeyFinder } from '../../../../../../../utils/UnknownKeyFinder.js';
import { TmdbApiError } from '../errors/TmdbApiError.js';
import { TmdbError } from '../errors/TmdbError.js';

/** @internal */
@singleton()
export class TmdbHttpTransport {
  private static readonly API_BASE_URL = 'https://api.themoviedb.org/3';

  constructor(
    private readonly httpClient: SimpleHttpClient,
    private readonly appConfig: AppConfiguration,
  ) {
  }

  /** @returns `null` when TMDB responds with 404 Not Found */
  async fetchJson<T>(path: string, schema: z.ZodType<T>, query?: GetRequestOptions['query']): Promise<T | null> {
    const url = TmdbHttpTransport.API_BASE_URL + path;
    const response = await this.httpClient.get(url, {
      headers: {
        'Authorization': `Bearer ${this.getApiReadAccessToken()}`,
        'Accept': 'application/json',
      },
      query,
    });

    if (response.statusCode === 404) {
      return null;
    }
    if (response.statusCode !== 200) {
      throw TmdbApiError.createForUnexpectedHttpStatusCode(url, response.statusCode, response.parseBodyAsText());
    }

    return this.parseBody(url, response.parseBodyAsText(), schema);
  }

  private parseBody<T>(url: string, body: string, schema: z.ZodType<T>): T {
    const json = this.parseJson(url, body);

    const parseResult = schema.safeParse(json);
    if (!parseResult.success) {
      throw TmdbApiError.createForInvalidResponse(url, body, parseResult.error);
    }

    this.logUnknownKeys(url, json, parseResult.data);
    return parseResult.data;
  }

  private parseJson(url: string, body: string): unknown {
    try {
      return JSON.parse(body, (_key, value) => value === '' ? null : value);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw TmdbApiError.createForInvalidResponse(url, body, err);
      }
      throw err;
    }
  }

  private logUnknownKeys(url: string, json: unknown, parsed: unknown): void {
    const unknownKeys = UnknownKeyFinder.find(json, parsed);
    if (unknownKeys.length > 0) {
      console.warn(`[TMDB] ${url} responded with ${unknownKeys.length} keys the schema does not know yet: ${unknownKeys.join(', ')}`);
    }
  }

  private getApiReadAccessToken(): string {
    const token = this.appConfig.config.media.externalProviders.theMovieDb.apiReadAccessToken;
    if (token.trim() === '') {
      throw new TmdbError('The API read access token is not configured');
    }
    return token;
  }
}
