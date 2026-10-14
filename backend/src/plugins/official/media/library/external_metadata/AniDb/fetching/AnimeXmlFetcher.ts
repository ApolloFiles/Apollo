import { singleton } from 'tsyringe';
import { AniDbAnimeXmlCache } from '../cache/AniDbAnimeXmlCache.js';
import { UncachedAnimeXmlFetcher } from './UncachedAnimeXmlFetcher.js';

/** @internal */
@singleton()
export class AnimeXmlFetcher {
  constructor(
    private readonly uncachedAnimeXmlFetcher: UncachedAnimeXmlFetcher,
    private readonly animeXmlCache: AniDbAnimeXmlCache,
  ) {
  }

  async fetchXml(animeId: number): Promise<string | null> {
    const cacheEntry = await this.animeXmlCache.getOrCreate(
      animeId.toString(),
      () => this.uncachedAnimeXmlFetcher.fetchXml(animeId),
    );

    return cacheEntry.value();
  }
}
