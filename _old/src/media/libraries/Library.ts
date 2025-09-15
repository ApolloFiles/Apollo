import * as PrismaClient from '@prisma/client';
import { getPrismaClient } from '../../Constants';
import ApolloUser from '../../user/ApolloUser';
import LocalFile from '../../user/files/local/LocalFile';

export default class Library {
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
    return getPrismaClient()!.mediaLibraryMedia.findMany({
      where: {
        libraryId: BigInt(this.id),
      },
      orderBy: {
        addedAt: 'desc',
      },
    });
  }

  fetchTitle(titleId: string): Promise<PrismaClient.MediaLibraryMedia | null> {
    return getPrismaClient()!.mediaLibraryMedia.findUnique({ where: { id: BigInt(titleId) } });
  }

  fetchMedia(titleId: string, mediaFilePath: string): Promise<PrismaClient.MediaLibraryMediaItem | null> {
    return getPrismaClient()!.mediaLibraryMediaItem.findUnique({
      where: {
        mediaId_filePath: {
          mediaId: BigInt(titleId),
          filePath: mediaFilePath,
        },
      },
    });
  }
}
