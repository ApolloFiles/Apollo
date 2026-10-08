import Fs from 'node:fs';
import Util from 'node:util';
import Zlib from 'node:zlib';
import { singleton } from 'tsyringe';
import ExpiringApolloCache from '../../../../../../../files/cache/global/ExpiringApolloCache.js';
import { UncachedAnimeXmlFetcher } from './UncachedAnimeXmlFetcher.js';

const gzipAsync = Util.promisify(Zlib.gzip);
const gunzipAsync = Util.promisify(Zlib.gunzip);

/** @internal */
@singleton()
export class AnimeXmlFetcher {
  private static readonly CACHE_ID_PREFIX = 'anidb_http_api';

  constructor(
    private readonly uncachedAnimeXmlFetcher: UncachedAnimeXmlFetcher,
    private readonly expiringApolloCache: ExpiringApolloCache,  // FIXME: Replace!!! (maybe with an implementation that can server stale items on error?)
  ) {
  }

  async fetchXml(animeId: number): Promise<string | null> {
    const cachedAnimeXml = await this.readFromCache(animeId);
    if (cachedAnimeXml !== undefined) {
      return cachedAnimeXml;
    }

    const animeXml = await this.uncachedAnimeXmlFetcher.fetchXml(animeId);
    await this.tryWriteToCache(animeId, animeXml);
    return animeXml;
  }

  private async readFromCache(animeId: number): Promise<string | null | undefined> {
    try {
      const cachePath = await this.expiringApolloCache.get(AnimeXmlFetcher.CACHE_ID_PREFIX, `a${animeId}`);
      if (cachePath == null) {
        return undefined;
      }

      const cacheBytes = await Fs.promises.readFile(cachePath.path);
      if (cacheBytes.length === 1 && cacheBytes[0] === 0x00) {
        return null;
      }

      return (await gunzipAsync(cacheBytes)).toString();
    } catch (err) {
      console.error('Error reading AniDB XML from cache:', err);
      return undefined;
    }
  }

  private async tryWriteToCache(animeId: number, animeXml: string | null): Promise<void> {
    try {
      await this.writeToCache(animeId, animeXml);
    } catch (err) {
      console.error(`Error writing the AniDB XML of anime ${animeId} to the cache:`, err);
    }
  }

  private async writeToCache(animeId: number, animeXml: string | null): Promise<void> {
    const cachePath = await this.expiringApolloCache.createOrUpdateTtl(AnimeXmlFetcher.CACHE_ID_PREFIX, `a${animeId}`, ExpiringApolloCache.TTL_ONE_DAY);

    let cacheBytes: Buffer;

    if (animeXml == null) {
      cacheBytes = Buffer.from([0x00]);
    } else {
      cacheBytes = await gzipAsync(animeXml);
    }

    await Fs.promises.writeFile(`${cachePath.path}.part`, cacheBytes);
    await Fs.promises.rename(`${cachePath.path}.part`, cachePath.path);
  }
}
