import { StringUtils } from '@spraxdev/node-commons';
import { getConfig } from '../../../Constants';
import { MetaProvider } from '../scan/analyser/DirectoryAnalyser';
import MyAnimeListClient, { MyAnimeListAnime } from './MyAnimeListClient';

export default class ExternalTitleMetaDataProvider {
  private static readonly KNOWN_PROVIDERS: { [identifier: string]: MyAnimeListClient } = {
    'myanimelist': new MyAnimeListClient(getConfig().data.mediaLibrary.externalProviders.myAnimeList.clientId)
  };

  async fetchMetaData(providers: MetaProvider[]): Promise<MyAnimeListAnime | null> {
    for (const providerIdentifier in ExternalTitleMetaDataProvider.KNOWN_PROVIDERS) {
      const metaProvider = providers.find((provider) => provider.providerId === providerIdentifier);
      if (metaProvider == null) {
        continue;
      }

      const provider = ExternalTitleMetaDataProvider.KNOWN_PROVIDERS[providerIdentifier];
      if (!provider.isAvailable()) {
        continue;
      }

      const externalMediaId = metaProvider.mediaId;
      if (!StringUtils.isNumeric(externalMediaId)) {
        continue;
      }

      return provider.fetchAnime(parseInt(metaProvider.mediaId, 10));
    }

    return null;
  }
}
