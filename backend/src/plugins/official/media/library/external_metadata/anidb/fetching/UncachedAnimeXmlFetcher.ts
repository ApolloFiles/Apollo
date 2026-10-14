import { singleton } from 'tsyringe';
import { AniDbApiError } from '../errors/AniDbApiError.js';
import { AniDbResponseError } from '../errors/AniDbResponseError.js';
import { AniDbHttpTransport } from '../transport/AniDbHttpTransport.js';

/** @internal */
@singleton()
export class UncachedAnimeXmlFetcher {
  private static readonly LOOKS_LIKE_ANIME_RESPONSE = /^\s*(?:<\?xml[^>]*\?>\s*)?<anime[\s/>]/;

  constructor(
    private readonly httpTransport: AniDbHttpTransport,
  ) {
  }

  async fetchXml(animeId: number): Promise<string | null> {
    const animeXml = await this.fetchXmlOrNullIfNotFound(animeId);
    if (animeXml != null && !UncachedAnimeXmlFetcher.LOOKS_LIKE_ANIME_RESPONSE.test(animeXml)) {
      throw AniDbApiError.createForUnexpectedAnimeResponse(animeXml);
    }

    return animeXml;
  }

  private async fetchXmlOrNullIfNotFound(animeId: number): Promise<string | null> {
    try {
      return await this.httpTransport.fetchXml({ request: 'anime', aid: animeId });
    } catch (err) {
      // TODO: Evaluate the possibility of caching other specific errors too
      if (err instanceof AniDbResponseError && err.errorText === 'Anime not found') {
        return null;
      }

      throw err;
    }
  }
}
