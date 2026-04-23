import { container } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import * as PrismaClient from '../../../../../database/prisma-client/client.js';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';

/**
 * @deprecated
 */
export default class Library {
  private readonly databaseClient = container.resolve(DatabaseClient);

  readonly owner: ApolloUser;
  readonly id: string;
  readonly name: string;
  readonly sharedWithUserIds: number[];

  readonly directories: LocalFile[];

  constructor(owner: ApolloUser, id: string, name: string, sharedWithUserIds: number[], directories: LocalFile[]) {
    this.owner = owner;
    this.id = id;
    this.name = name;
    this.sharedWithUserIds = sharedWithUserIds;
    this.directories = directories;
  }

  fetchTitles(): Promise<PrismaClient.MediaLibraryMedia[]> {
    return this.databaseClient.mediaLibraryMedia.findMany({
      where: {
        libraryId: BigInt(this.id),
      },
      orderBy: {
        addedAt: 'desc',
      },
    });
  }

  fetchMedia(mediaId: bigint): Promise<PrismaClient.MediaLibraryMedia | null> {
    return this.databaseClient.mediaLibraryMedia.findUnique({ where: { id: mediaId } });
  }

  fetchMediaItem(mediaItemId: bigint): Promise<PrismaClient.MediaLibraryMediaItem | null> {
    return this.databaseClient.mediaLibraryMediaItem.findUnique({ where: { id: mediaItemId } });
  }

  async fetchMediaWatchProgressInSeconds(mediaItemId: bigint): Promise<number | null> {
    const watchProgress = await this.databaseClient.mediaLibraryUserWatchProgress.findUnique({
      where: {
        userId_mediaItemId: {
          userId: this.owner.id,
          mediaItemId,
        },
      },
      select: {
        durationInSec: true,
      },
    });

    return watchProgress ? watchProgress.durationInSec : null;
  }

  fetchMediaFull(mediaId: bigint): Promise<
    (
      Omit<PrismaClient.MediaLibraryMedia, 'directoryUri' | 'addedAt' | 'externalApiFetchedAt'>
      & { items: Omit<PrismaClient.MediaLibraryMediaItem, 'mediaId' | 'relativeFilePath' | 'lastScannedAt' | 'addedAt' | 'externalApiFetchedAt'>[] }
      ) | null> {
    return this.databaseClient.mediaLibraryMedia.findUnique({
      where: {
        id: mediaId,
      },
      select: {
        id: true,
        libraryId: true,
        title: true,
        synopsis: true,
        items: {
          select: {
            id: true,
            relativeFilePath: true,
            title: true,
            durationInSec: true,
            episodeNumber: true,
            seasonNumber: true,
            synopsis: true,
          }
        },
      },
    });
  }

  fetchMediaItemByPath(mediaId: string, relativeFilePath: string): Promise<PrismaClient.MediaLibraryMediaItem | null> {
    return this.databaseClient.mediaLibraryMediaItem.findUnique({
      where: {
        mediaId_relativeFilePath: {
          mediaId: BigInt(mediaId),
          relativeFilePath: relativeFilePath,
        },
      },
    });
  }
}
