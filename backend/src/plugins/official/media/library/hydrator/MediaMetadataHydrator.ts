import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaExternalIdSource } from '../../../../../database/prisma-client/enums.js';
import type MediaLibraryMedia from '../database/MediaLibraryMedia.js';
import CachedTheMovieDbApiClient from '../external_metadata/TMDB/CachedTheMovieDbApiClient.js';
import type { TMDBMovieDetails, TMDBTvSeriesDetails } from '../external_metadata/TMDB/TMDBApiResponseSchemas.js';

type TheMovieDbMetadata =
  { type: 'tv', details: TMDBTvSeriesDetails }
  | { type: 'movie', details: TMDBMovieDetails }
  | null;

@singleton()
export default class MediaMetadataHydrator {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly theMovieDbApiClient: CachedTheMovieDbApiClient,
  ) {
  }

  async hydrate(media: MediaLibraryMedia): Promise<void> {
    const mediaMetadata = await this.fetchTheMovieDbMetadata(media);
    if (mediaMetadata == null) {
      await this.databaseClient.mediaLibraryMedia.update({
        where: { id: media.id },
        data: {
          externalApiFetchedAt: await this.databaseClient.fetchNow(),
        },
      });
      return;
    }

    await this.databaseClient.mediaLibraryMedia.update({
      where: { id: media.id },
      data: {
        title: mediaMetadata.type === 'movie' ? mediaMetadata.details.title : mediaMetadata.details.name,
        synopsis: mediaMetadata.details.overview,
        externalApiFetchedAt: await this.databaseClient.fetchNow(),
      },
    });
  }

  private async fetchTheMovieDbMetadata(media: MediaLibraryMedia): Promise<TheMovieDbMetadata> {
    const externalIds = await this.findExternalIds(media);

    if (externalIds['THE_MOVIE_DB'] != null) {
      const theMovieDbId = externalIds['THE_MOVIE_DB'];

      try {
        if (theMovieDbId.startsWith('tv/')) {
          return {
            type: 'tv',
            details: await this.theMovieDbApiClient.findTvSeriesById(parseInt(theMovieDbId.substring(3), 10)),
          };
        }

        if (theMovieDbId.startsWith('movie/')) {
          return {
            type: 'movie',
            details: await this.theMovieDbApiClient.findMovieById(parseInt(theMovieDbId.substring(6), 10)),
          };
        }

        console.warn(`Unknown THE_MOVIE_DB external ID format in database: ${theMovieDbId}`);
      } catch (err) {
        console.error(`Error fetching TMDB metadata for ID ${JSON.stringify(theMovieDbId)}`, err);
      }
    }

    if (externalIds['IMDB'] != null) {
      const imdbId = externalIds['IMDB'];

      try {
        return await this.theMovieDbApiClient.findOneByExternalId(imdbId, 'imdb_id');
      } catch (err) {
        console.error(`Error fetching TMDB metadata for IMDB ID ${JSON.stringify(imdbId)}`, err);
      }
    }

    if (externalIds['THE_TV_DB'] != null) {
      const theTvDbId = externalIds['THE_TV_DB'];

      try {
        return await this.theMovieDbApiClient.findOneByExternalId(theTvDbId, 'tvdb_id');
      } catch (err) {
        console.error(`Error fetching TMDB metadata for TheTVDB ID ${JSON.stringify(theTvDbId)}`, err);
      }
    }

    return null;
  }

  private async findExternalIds(media: MediaLibraryMedia): Promise<Partial<Record<MediaLibraryMediaExternalIdSource, string>>> {
    const externalIds = await this.databaseClient.mediaLibraryMediaExternalIds.findMany({
      where: {
        mediaId: media.id,
      },
      select: {
        source: true,
        externalId: true,
      },
    });

    return Object.fromEntries(externalIds.map(entry => [entry.source, entry.externalId]));
  }
}
