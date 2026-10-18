import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaExternalIdSource } from '../../../../../database/prisma-client/enums.js';
import type { PrismaPromise } from '../../../../../database/prisma-client/internal/prismaNamespace.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type ReadContentsLibraryMedia from '../database/media/ReadContentsLibraryMedia.js';
import { TmdbErrorClassifier } from '../external_metadata/tmdb/errors/TmdbErrorClassifier.js';
import { TmdbClient, type TmdbMovie, type TmdbTvSeries } from '../external_metadata/tmdb/TmdbClient.js';
import { MediaFallbackImageCache } from '../images/MediaFallbackImageCache.js';

type TheMovieDbMetadata =
  { type: 'tv', details: TmdbTvSeries }
  | { type: 'movie', details: TmdbMovie };

@singleton()
export default class MediaMetadataHydrator {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly tmdbClient: TmdbClient,
    private readonly userProvider: UserProvider,
    private readonly mediaFallbackImageCache: MediaFallbackImageCache,
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

    let firstAirYear: number | undefined = undefined;
    const firstAirDate = mediaMetadata.type === 'movie' ? mediaMetadata.details.release_date : mediaMetadata.details.first_air_date;
    if (firstAirDate != null && /^\d{4}-\d{2}-\d{2}$/.test(firstAirDate)) {
      firstAirYear = parseInt(firstAirDate.substring(0, 4));
    }

    await this.databaseClient.mediaLibraryMedia.update({
      where: { id: media.id },
      data: {
        title: mediaMetadata.type === 'movie' ? mediaMetadata.details.title : mediaMetadata.details.name,
        synopsis: mediaMetadata.details.overview?.trim() || undefined,
        year: firstAirYear,
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
      const posterImage = await this.tmdbClient.fetchImage(mediaMetadata.details.poster_path);

      if (posterImage != null) {
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
    }

    if (mediaMetadata.details.backdrop_path != null) {
      const backdropImage = await this.tmdbClient.fetchImage(mediaMetadata.details.backdrop_path);
      if (backdropImage != null) {
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
    }

    const availableLogos = mediaMetadata.details.images.logos;
    const bestLogo = availableLogos.reduce<null | typeof availableLogos[number]>((bestSoFar, current) => {
      if (bestSoFar == null) {
        return current;
      }

      // Prefer English ('en'), then media's original language, then by vote count
      const getLanguagePriority = (iso_639_1: string | null): number => {
        if (iso_639_1 === 'en') {
          return 3;
        }
        if (iso_639_1 === mediaMetadata.details.original_language) {
          return 2;
        }
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
      const logoImage = await this.tmdbClient.fetchImage(bestLogo.file_path);
      if (logoImage != null) {
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
    }

    await this.databaseClient.$transaction(fallbackImageDatabaseOperations);
    await this.deleteCachedFallbackImages(media);
  }

  private async deleteCachedFallbackImages(media: ReadContentsLibraryMedia): Promise<void> {
    const mediaOwner = await this.userProvider.findById(media.libraryOwnerId);
    if (mediaOwner != null) {
      await this.mediaFallbackImageCache.forUser(mediaOwner).deleteGroup(MediaFallbackImageCache.toGroupKey(media.id));
    }
  }

  private async fetchTheMovieDbMetadata(media: ReadContentsLibraryMedia): Promise<TheMovieDbMetadata | null> {
    const externalIds = await this.findExternalIds(media);

    if (externalIds['THE_MOVIE_DB'] != null) {
      const theMovieDbId = externalIds['THE_MOVIE_DB'];

      try {
        const metadata = await this.fetchByTheMovieDbId(theMovieDbId);
        if (metadata != null) {
          return metadata;
        }
      } catch (err) {
        this.rethrowIfTransientOrLog(`ID ${JSON.stringify(theMovieDbId)}`, err);
      }
    }

    if (externalIds['IMDB'] != null) {
      const imdbId = externalIds['IMDB'];

      try {
        const metadata = await this.tmdbClient.findOneByExternalId(imdbId, 'imdb_id');
        if (metadata != null) {
          return metadata;
        }
      } catch (err) {
        this.rethrowIfTransientOrLog(`IMDB ID ${JSON.stringify(imdbId)}`, err);
      }
    }

    if (externalIds['THE_TV_DB'] != null) {
      const theTvDbId = externalIds['THE_TV_DB'];

      try {
        const metadata = await this.tmdbClient.findOneByExternalId(theTvDbId, 'tvdb_id');
        if (metadata != null) {
          return metadata;
        }
      } catch (err) {
        this.rethrowIfTransientOrLog(`TheTVDB ID ${JSON.stringify(theTvDbId)}`, err);
      }
    }

    return null;
  }

  /** A transient failure must not end the hydration, or the media would be marked as fetched and never retried */
  private rethrowIfTransientOrLog(externalIdDescription: string, err: unknown): void {
    if (TmdbErrorClassifier.isTransient(err)) {
      throw err;
    }
    console.error(`Error fetching TMDB metadata for ${externalIdDescription}`, err);
  }

  private async fetchByTheMovieDbId(theMovieDbId: string): Promise<TheMovieDbMetadata | null> {
    if (theMovieDbId.startsWith('tv/')) {
      const details = await this.tmdbClient.fetchTvSeries(parseInt(theMovieDbId.substring(3), 10));
      if (details == null) {
        console.warn(`TMDB does not know a TV series with the THE_MOVIE_DB external ID ${JSON.stringify(theMovieDbId)}`);
        return null;
      }
      return { type: 'tv', details };
    }

    if (theMovieDbId.startsWith('movie/')) {
      const details = await this.tmdbClient.fetchMovie(parseInt(theMovieDbId.substring(6), 10));
      if (details == null) {
        console.warn(`TMDB does not know a movie with the THE_MOVIE_DB external ID ${JSON.stringify(theMovieDbId)}`);
        return null;
      }
      return { type: 'movie', details };
    }

    console.warn(`Unknown THE_MOVIE_DB external ID format in database: ${theMovieDbId}`);
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
