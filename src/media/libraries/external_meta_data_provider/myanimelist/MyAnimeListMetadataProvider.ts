import { StringUtils } from '@spraxdev/node-commons';
import { getHttpClient } from '../../../../Constants';
import { MetaProvider } from '../../scan/analyser/DirectoryAnalyser';
import MetadataProvider, { TitleMetaData } from '../MetadataProvider';
import MyAnimeListApiClient, { MyAnimeListAnime } from './MyAnimeListApiClient';

export default class MyAnimeListMetadataProvider extends MetadataProvider {
  private readonly clientId: string;
  private readonly myAnimeListClient: MyAnimeListApiClient;

  constructor(clientId: string) {
    super();

    this.clientId = clientId;
    this.myAnimeListClient = new MyAnimeListApiClient(clientId);
  }

  isAvailable(): boolean {
    return this.clientId != '';
  }

  async fetchByMetaProvider(metaProvider: MetaProvider): Promise<TitleMetaData | null> {
    if (metaProvider.providerId !== 'myanimelist') {
      throw new Error(`Unknown/Unsupported providerId for MyAnimeListMetaProviderClient (expected 'myanimelist'): ${metaProvider.providerId}`);
    }

    if (!StringUtils.isNumeric(metaProvider.mediaId)) {
      throw new Error(`Expected numeric mediaId for MyAnimeListMetaProviderClient: ${metaProvider.mediaId}`);
    }

    const animeId = parseInt(metaProvider.mediaId, 10);
    if (!Number.isSafeInteger(animeId) || animeId <= 0) {
      throw new Error(`Expected positive integer mediaId for MyAnimeListMetaProviderClient: ${metaProvider.mediaId}`);
    }

    return this.convertToTitleMetaData(await this.myAnimeListClient.fetchAnime(animeId));
  }

  private convertToTitleMetaData(response: MyAnimeListAnime | null): TitleMetaData | null {
    if (response == null) {
      return null;
    }

    return {
      id: response.id,
      title: response.title,
      synopsis: response.synopsis,

      hasPosterImage: response.coverImageUrl != null && response.coverImageUrl !== '',
      fetchPosterImage: async () => {
        if (response.coverImageUrl == null || response.coverImageUrl === '') {
          return null;
        }

        const coverResponse = await getHttpClient().get(response.coverImageUrl);
        if (coverResponse.status === 404) {
          return null;
        }
        if (coverResponse.status === 200) {
          return coverResponse.body;
        }
        throw new Error(`Failed to download poster image from '${response.coverImageUrl}': ${coverResponse.status} ${coverResponse.body.toString('utf-8')}`);
      },

      year: response.year,
      genres: response.genres
    };
  }
}
