import { getConfig } from '../../../Constants';
import { MetaProvider } from '../scan/analyser/DirectoryAnalyser';
import MetadataProvider, { TitleMetaData } from './MetadataProvider';
import MyAnimeListMetadataProvider from './myanimelist/MyAnimeListMetadataProvider';
import TheMovieDatabaseMetadataProvider from './tmdb/TheMovieDatabaseMetadataProvider';
import TheTvDatabaseMetadataProvider from './tvdb/TheTvDatabaseMetadataProvider';

export default class ExternalTitleMetaDataProvider {
  private static readonly KNOWN_PROVIDERS: { [identifier: string]: MetadataProvider } = {
    'myanimelist': new MyAnimeListMetadataProvider(getConfig().data.mediaLibrary.externalProviders.myAnimeList.clientId),
    'tmdb': new TheMovieDatabaseMetadataProvider(getConfig().data.mediaLibrary.externalProviders.theMovieDb.apiReadAccessToken),
    'imdb': new TheMovieDatabaseMetadataProvider(getConfig().data.mediaLibrary.externalProviders.theMovieDb.apiReadAccessToken),
    'tvdb': new TheTvDatabaseMetadataProvider(getConfig().data.mediaLibrary.externalProviders.theTvDb.apiKey),
  };

  async fetchMetaData(providers: MetaProvider[]): Promise<TitleMetaData | null> {
    for (const providerIdentifier in ExternalTitleMetaDataProvider.KNOWN_PROVIDERS) {
      const providerClient = providers.find((provider) => provider.providerId.toLowerCase() === providerIdentifier);
      if (providerClient == null) {
        continue;
      }

      const provider = ExternalTitleMetaDataProvider.KNOWN_PROVIDERS[providerIdentifier];
      if (!provider.isAvailable()) {
        continue;
      }

      return await provider.fetchByMetaProvider(providerClient);
    }

    return null;
  }
}
