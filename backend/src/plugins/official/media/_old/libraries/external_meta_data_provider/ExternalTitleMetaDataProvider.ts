import { container } from 'tsyringe';
import {UndiciHttpClient,UserAgentGenerator} from '@spraxdev/node-commons/http';
import AppConfiguration from '../../../../../../config/AppConfiguration.js';
import type { MetaProvider } from '../scan/analyser/DirectoryAnalyser.js';
import type { default as MetadataProvider, TitleMetaData } from './MetadataProvider.js';
import MyAnimeListMetadataProvider from './myanimelist/MyAnimeListMetadataProvider.js';
import TheMovieDatabaseMetadataProvider from './tmdb/TheMovieDatabaseMetadataProvider.js';
import TheTvDatabaseMetadataProvider from './tvdb/TheTvDatabaseMetadataProvider.js';

export default class ExternalTitleMetaDataProvider {
  private static readonly KNOWN_PROVIDERS: { [identifier: string]: MetadataProvider } = {
    'myanimelist': new MyAnimeListMetadataProvider(container.resolve(AppConfiguration).config.media.externalProviders.myAnimeList.clientId, new UndiciHttpClient(UserAgentGenerator.generate('Apollo','0.0.1-SNAPSHOT'))),
    'tmdb': new TheMovieDatabaseMetadataProvider(container.resolve(AppConfiguration).config.media.externalProviders.theMovieDb.apiReadAccessToken, new UndiciHttpClient(UserAgentGenerator.generate('Apollo','0.0.1-SNAPSHOT'))),
    'imdb': new TheMovieDatabaseMetadataProvider(container.resolve(AppConfiguration).config.media.externalProviders.theMovieDb.apiReadAccessToken, new UndiciHttpClient(UserAgentGenerator.generate('Apollo','0.0.1-SNAPSHOT'))),
    'tvdb': new TheTvDatabaseMetadataProvider(container.resolve(AppConfiguration).config.media.externalProviders.theTvDb.apiKey, new UndiciHttpClient(UserAgentGenerator.generate('Apollo','0.0.1-SNAPSHOT'))),
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
