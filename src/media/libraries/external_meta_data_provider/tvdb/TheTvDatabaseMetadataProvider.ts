import { StringUtils } from '@spraxdev/node-commons';
import { getHttpClient } from '../../../../Constants';
import { MetaProvider } from '../../scan/analyser/DirectoryAnalyser';
import MetadataProvider, { TitleMetaData } from '../MetadataProvider';
import { TheTvDatabaseApiClient, TvDbMovie, TvDbSeries } from './TheTvDatabaseApiClient';

export default class TheTvDatabaseMetadataProvider extends MetadataProvider {
  private readonly apiKey: string;
  private readonly theTvDatabaseClient: TheTvDatabaseApiClient;

  constructor(apiKey: string) {
    super();

    this.apiKey = apiKey;
    this.theTvDatabaseClient = new TheTvDatabaseApiClient(apiKey);
  }

  isAvailable(): boolean {
    return this.apiKey != '';
  }

  async fetchByMetaProvider(metaProvider: MetaProvider): Promise<TitleMetaData | null> {
    const mediaId = this.parseMediaId(metaProvider.mediaId);

    if (mediaId.mediaType === 'movies') {
      return this.convertToTitleMetaData(await this.theTvDatabaseClient.fetchMovieById(mediaId.id));
    }
    if (mediaId.mediaType === 'series') {
      return this.convertToTitleMetaData(await this.theTvDatabaseClient.fetchSeriesById(mediaId.id));
    }

    throw new Error(`Unknown/Unsupported mediaType '${mediaId.mediaType}' for TheTvDatabase (expected 'movies' or 'series'): ${metaProvider.mediaId}`);
  }

  private convertToTitleMetaData(response: TvDbSeries | TvDbMovie | null): TitleMetaData | null {
    if (response == null) {
      return null;
    }

    return {
      id: response.id,
      title: response.name,
      synopsis: response.overview,

      hasPosterImage: response.image != null,
      fetchPosterImage: async () => {
        if (response.image == null) {
          return null;
        }

        const coverResponse = await getHttpClient().get(response.image);
        if (coverResponse.status === 404) {
          return null;
        }
        if (coverResponse.status === 200) {
          return coverResponse.body;
        }
        throw new Error(`Failed to download poster image from '${response.image}': ${coverResponse.status} ${coverResponse.body.toString('utf-8')}`);
      },

      year: response.year,
      genres: response.genres,
    };
  }

  private parseMediaId(mediaId: string): { mediaType: 'movies' | 'series', id: number } {
    const indexOfUnderscore = mediaId.indexOf('_');
    if (indexOfUnderscore === -1) {
      throw new Error(`Invalid mediaId for TheTvDatabase: ${mediaId}`);
    }

    const mediaType = mediaId.substring(0, indexOfUnderscore);
    const idStr = mediaId.substring(indexOfUnderscore + 1);
    const id = parseInt(idStr, 10);

    if (mediaType !== 'movies' && mediaType !== 'series') {
      throw new Error(`Invalid mediaId (format of \${mediaType}_\${id}) for TheTvDatabase (mediaType needs to be 'movies' or 'series'): ${mediaId}`);
    }
    if (!StringUtils.isNumeric(idStr) || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Invalid mediaId (format of \${mediaType}_\${id}) for TheTvDatabase (id needs to be a positive integer): ${mediaId}`);
    }

    return {
      mediaType: mediaType,
      id,
    };
  }
}
