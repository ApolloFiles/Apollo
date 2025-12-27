import type { GetRequestOptions, HttpResponse } from '@spraxdev/node-commons/http';
import { singleton } from 'tsyringe';
import AppConfiguration from '../../../../../../config/AppConfiguration.js';
import SimpleHttpClient from '../../../../../../http/SimpleHttpClient.js';
import type {
  ExternalIdSource,
  FindByExternalIdResult,
  TheMovieDbApiClientInterface,
} from './TheMovieDbApiClientInterface.js';
import {
  CONFIGURATION_RESPONSE_SCHEMA,
  FIND_BY_EXTERNAL_ID_RESPONSE_SCHEMA,
  FULL_MOVIE_DETAILS_RESPONSE_SCHEMA,
  FULL_TV_SERIES_DETAILS_RESPONSE_SCHEMA,
  type TMDBApiConfiguration,
  type TMDBMovieDetails,
  type TMDBTvSeriesDetails,
} from './TMDBApiResponseSchemas.js';

@singleton()
export default class TheMovieDbApiClient implements TheMovieDbApiClientInterface {
  constructor(
    private readonly httpClient: SimpleHttpClient,
    private readonly appConfig: AppConfiguration,
  ) {
  }

  async findMovieById(movieId: number): Promise<TMDBMovieDetails> {
    const findResult = await this.fetchAuthenticated(
      `/movie/${movieId}`,
      { append_to_response: 'external_ids,images,alternative_titles' },
    );
    if (findResult.statusCode !== 200) {
      throw new Error(`Got status '${findResult.statusCode}' from TheMovieDb API: ${findResult.body.toString('utf-8')}`);
    }

    return FULL_MOVIE_DETAILS_RESPONSE_SCHEMA.parse(findResult.parseBodyAsJson());
  }

  async findTvSeriesById(seriesId: number): Promise<TMDBTvSeriesDetails> {
    const findResult = await this.fetchAuthenticated(
      `/tv/${seriesId}`,
      { append_to_response: 'external_ids,images,alternative_titles' },
    );
    if (findResult.statusCode !== 200) {
      throw new Error(`Got status '${findResult.statusCode}' from TheMovieDb API: ${findResult.body.toString('utf-8')}`);
    }

    return FULL_TV_SERIES_DETAILS_RESPONSE_SCHEMA.parse(findResult.parseBodyAsJson());
  }

  async findOneByExternalId(externalId: string, externalSource: ExternalIdSource): Promise<FindByExternalIdResult> {
    const findResult = await this.fetchAuthenticated(
      `/find/${encodeURIComponent(externalId)}`,
      { external_source: externalSource },
    );
    if (findResult.statusCode !== 200) {
      throw new Error(`Got status '${findResult.statusCode}' from TheMovieDb API: ${findResult.body.toString('utf-8')}`);
    }

    const findBody = FIND_BY_EXTERNAL_ID_RESPONSE_SCHEMA.parse(findResult.parseBodyAsJson());

    if (findBody.tv_results.length === 0 && findBody.movie_results.length === 0) {
      return null;
    }

    if (findBody.tv_results.length === 1) {
      return {
        type: 'tv',
        details: await this.findTvSeriesById(findBody.tv_results[0].id),
      };
    }

    if (findBody.movie_results.length === 1) {
      return {
        type: 'movie',
        details: await this.findMovieById(findBody.movie_results[0].id),
      };
    }

    if (findBody.tv_results.length > 0 && findBody.movie_results.length > 0) {
      console.warn(`Found movie and tv series for external id '${externalId}' (source: ${externalSource}):`, findBody);
    }
    return null;
  }

  async fetchImage(imagePath: string, apiConfiguration?: TMDBApiConfiguration): Promise<Buffer> {
    apiConfiguration = apiConfiguration ?? await this.fetchApiConfiguration();

    const imageUrl = apiConfiguration.images.secure_base_url + 'original' + imagePath;
    const imageResult = await this.httpClient.get(imageUrl, {headers: { 'Accept': 'image/*' }});
    if (imageResult.statusCode !== 200) {
      throw new Error(`Got status '${imageResult.statusCode}' from TheMovieDb API when fetching image: ${imageResult.body.toString('utf-8')}`);
    }

    return imageResult.body;
  }

  async fetchApiConfiguration(): Promise<TMDBApiConfiguration> {
    const configResult = await this.fetchAuthenticated(`/configuration`);
    if (configResult.statusCode !== 200) {
      throw new Error(`Got status '${configResult.statusCode}' from TheMovieDb API: ${configResult.body.toString('utf-8')}`);
    }

    return CONFIGURATION_RESPONSE_SCHEMA.parse(configResult.parseBodyAsJson());
  }

  private async fetchAuthenticated(
    url: string,
    queryParams?: GetRequestOptions['query'],
    acceptHeader = 'application/json',
  ): Promise<HttpResponse> {
    const apiToken = this.appConfig.config.media.externalProviders.theMovieDb.apiReadAccessToken;
    return this.httpClient.get(`https://api.themoviedb.org/3${url}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': acceptHeader,
      },
      query: queryParams,
    });
  }
}
