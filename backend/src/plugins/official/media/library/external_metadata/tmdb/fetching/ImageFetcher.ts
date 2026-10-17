import type { HttpResponse } from '@spraxdev/node-commons/http';
import { singleton } from 'tsyringe';
import SimpleHttpClient from '../../../../../../../http/SimpleHttpClient.js';
import { TmdbApiError } from '../errors/TmdbApiError.js';
import { type ApiConfiguration, TMDB_CONFIGURATION_SCHEMA } from '../schema/ConfigurationSchema.js';
import { TmdbHttpTransport } from '../transport/TmdbHttpTransport.js';

/** @internal */
@singleton()
export class ImageFetcher {
  private apiConfiguration: ApiConfiguration | undefined;

  constructor(
    private readonly httpTransport: TmdbHttpTransport,
    private readonly httpClient: SimpleHttpClient,
  ) {
  }

  async fetchImage(filePath: string): Promise<Buffer | null> {
    const apiConfiguration = await this.getApiConfiguration();
    const imageUrl = apiConfiguration.images.secure_base_url + 'original' + filePath;

    const imageResponse = await this.httpClient.get(imageUrl, { headers: { 'Accept': 'image/*' } });

    if (imageResponse.statusCode == 404) {
      return null;
    }
    this.handleUnexpectedResponse(imageUrl, imageResponse);

    return imageResponse.body;
  }

  private handleUnexpectedResponse(imageUrl: string, imageResponse: HttpResponse): void {
    if (imageResponse.statusCode != 200) {
      throw TmdbApiError.createForUnexpectedHttpStatusCode(imageUrl, imageResponse.statusCode, imageResponse.parseBodyAsText());
    }

    const contentType = imageResponse.getHeader('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw TmdbApiError.createForUnexpectedImageContentType(imageUrl, contentType);
    }
  }

  private async getApiConfiguration(): Promise<ApiConfiguration> {
    if (this.apiConfiguration === undefined) {
      const apiConfiguration = await this.httpTransport.fetchJson('/configuration', TMDB_CONFIGURATION_SCHEMA);
      if (apiConfiguration == null) {
        throw TmdbApiError.createForMissingConfiguration();
      }

      this.apiConfiguration = apiConfiguration;
    }

    return this.apiConfiguration;
  }
}
