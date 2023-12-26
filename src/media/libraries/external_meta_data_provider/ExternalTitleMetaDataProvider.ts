import { getConfig } from '../../../Constants';
import MyAnimeListClient, { MyAnimeListAnime } from './MyAnimeListClient';

export default class ExternalTitleMetaDataProvider {
  private static readonly KNOWN_PROVIDERS: { [identifier: string]: MyAnimeListClient } = {
    'myanimelist': new MyAnimeListClient(getConfig().data.mediaLibrary.externalProviders.myAnimeList.clientId)
  };

  async fetchMetaData(providers: { [identifier: string]: number }): Promise<MyAnimeListAnime | null> {
    for (const providerIdentifier in ExternalTitleMetaDataProvider.KNOWN_PROVIDERS) {
      if (!providers.hasOwnProperty(providerIdentifier)) {
        continue;
      }

      const provider = ExternalTitleMetaDataProvider.KNOWN_PROVIDERS[providerIdentifier];
      const externalMediaId = providers[providerIdentifier];
      if (!provider.isAvailable()) {
        continue;
      }

      return provider.fetchAnime(externalMediaId);
    }

    return null;
  }
}
