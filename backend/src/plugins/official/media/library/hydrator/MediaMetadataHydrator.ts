import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaExternalIdSource } from '../../../../../database/prisma-client/enums.js';
import type { PrismaPromise } from '../../../../../database/prisma-client/internal/prismaNamespace.js';
import type ReadContentsLibraryMedia from '../database/media/ReadContentsLibraryMedia.js';
import CachedTheMovieDbApiClient from '../external_metadata/TMDB/CachedTheMovieDbApiClient.js';
import type { TMDBMovieDetails, TMDBTvSeriesDetails } from '../external_metadata/TMDB/TMDBApiResponseSchemas.js';

type TheMovieDbMetadata =
  { type: 'tv', details: TMDBTvSeriesDetails }
  | { type: 'movie', details: TMDBMovieDetails };

@singleton()
export default class MediaMetadataHydrator {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly theMovieDbApiClient: CachedTheMovieDbApiClient,
  ) {
  }

  async hydrate(media: ReadContentsLibraryMedia): Promise<void> {
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

    await this.fetchAndPersistFallbackImages(media, mediaMetadata);
  }

  private async fetchAndPersistFallbackImages(media: ReadContentsLibraryMedia, mediaMetadata: TheMovieDbMetadata): Promise<void> {
    const fallbackImageDatabaseOperations: PrismaPromise<unknown>[] = [
      this.databaseClient.mediaLibraryMediaFallbackImages.deleteMany({
        where: { mediaId: media.id },
      }),
    ];

    if (mediaMetadata.details.poster_path != null) {
      const posterImage = await this.theMovieDbApiClient.fetchImage(mediaMetadata.details.poster_path);
      const posterImageUint8Array = new Uint8Array(posterImage);

      fallbackImageDatabaseOperations.push(
        this.databaseClient.mediaLibraryMediaFallbackImages.upsert({
          where: {
            mediaId_type: {
              mediaId: media.id,
              type: 'POSTER',
            },
          },
          create: {
            mediaId: media.id,
            type: 'POSTER',
            image: posterImageUint8Array,
          },
          update: {
            image: posterImageUint8Array,
          },
        }),
      );
    }

    if (mediaMetadata.details.backdrop_path != null) {
      const backdropImage = await this.theMovieDbApiClient.fetchImage(mediaMetadata.details.backdrop_path);
      const backdropImageUint8Array = new Uint8Array(backdropImage);

      fallbackImageDatabaseOperations.push(
        this.databaseClient.mediaLibraryMediaFallbackImages.upsert({
          where: {
            mediaId_type: {
              mediaId: media.id,
              type: 'BACKDROP',
            },
          },
          create: {
            mediaId: media.id,
            type: 'BACKDROP',
            image: backdropImageUint8Array,
          },
          update: {
            image: backdropImageUint8Array,
          },
        }),
      );
    }

    const availableLogos = mediaMetadata.details.images.logos;
    const bestLogo = availableLogos.reduce<null | typeof availableLogos[number]>((bestSoFar, current) => {
      if (bestSoFar == null) {
        return current;
      }

      // Prefer English ('en'), then media's original language, then by vote count
      const getLanguagePriority = (iso_639_1: string | null): number => {
        if (iso_639_1 === 'en') return 3;
        if (iso_639_1 === mediaMetadata.details.original_language) return 2;
        return 1;
      };

      const currentPriority = getLanguagePriority(current.iso_639_1);
      const bestSoFarPriority = getLanguagePriority(bestSoFar.iso_639_1);

      if (currentPriority !== bestSoFarPriority) {
        return currentPriority > bestSoFarPriority ? current : bestSoFar;
      }

      // If same language priority, prefer by vote count
      return current.vote_count > bestSoFar.vote_count ? current : bestSoFar;
    }, null);

    if (bestLogo != null && bestLogo.file_path != null) {
      const logoImage = await this.theMovieDbApiClient.fetchImage(bestLogo.file_path);
      const logoImageUint8Array = new Uint8Array(logoImage);

      fallbackImageDatabaseOperations.push(
        this.databaseClient.mediaLibraryMediaFallbackImages.upsert({
          where: {
            mediaId_type: {
              mediaId: media.id,
              type: 'LOGO',
            },
          },
          create: {
            mediaId: media.id,
            type: 'LOGO',
            image: logoImageUint8Array,
          },
          update: {
            image: logoImageUint8Array,
          },
        }),
      );
    }

    await this.databaseClient.$transaction(fallbackImageDatabaseOperations);
  }

  private async fetchTheMovieDbMetadata(media: ReadContentsLibraryMedia): Promise<TheMovieDbMetadata | null> {
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

  private async findExternalIds(media: ReadContentsLibraryMedia): Promise<Partial<Record<MediaLibraryMediaExternalIdSource, string>>> {
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
