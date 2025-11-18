// TODO: Make sure to properly type null and maybe convert empty strings to null to avoid confusion (and update MyAnimeListMetadataProvider to reflect theses changes)
import type { HttpClient, HttpResponse } from '@spraxdev/node-commons/http';

export interface MyAnimeListAnime {
  readonly id: number;
  readonly title: string;
  readonly synopsis: string;
  readonly coverImageUrl: string;

  readonly year: number;
  readonly genres: string[];
}

export default class MyAnimeListApiClient {
  constructor(
    private readonly clientId: string,
    private readonly httpClient: HttpClient,
  ) {
  }

  async fetchAnime(animeId: number): Promise<MyAnimeListAnime | null> {
    const fields = ['id', 'title', 'synopsis', /*'alternative_titles',*/ 'genres', 'start_season', 'rating', 'start_date', 'main_picture'];
    const apiRes = await this.fetchApiUrl(`https://api.myanimelist.net/v2/anime/${encodeURIComponent(animeId)}?nsfw=true&fields=${encodeURIComponent(fields.join(','))}`);

    if (apiRes.statusCode == 404) {
      return null;
    }
    if (apiRes.statusCode == 200) {
      return this.parseAnimeResponse(JSON.parse(apiRes.body.toString('utf-8')));
    }
    throw new Error(`Got status '${apiRes.statusCode}' from MyAnimeList API: ${apiRes.body.toString('utf-8')}`);
  }

  private parseAnimeResponse(response: any): MyAnimeListAnime {
    return {
      id: response.id,
      title: response.title,
      synopsis: response.synopsis,
      coverImageUrl: response.main_picture.large,

      year: new Date(response.start_date).getUTCFullYear(),
      genres: response.genres?.map((genre: any) => genre.name) ?? [],
    };
  }

  private fetchApiUrl(apiUrl: string): Promise<HttpResponse> {
    return this.httpClient.get(apiUrl, {
      headers: {
        Accept: 'application/json',
        'X-MAL-CLIENT-ID': this.clientId,
      },
    });
  }
}
