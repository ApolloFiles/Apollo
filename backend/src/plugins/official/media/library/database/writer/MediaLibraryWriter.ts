import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import type { MediaLibraryUpdateArgs } from '../../../../../../database/prisma-client/models/MediaLibrary.js';
import type ApolloFileURI from '../../../../../../uri/ApolloFileURI.js';

type UpdateData = {
  name?: string,
  directoryUris?: ApolloFileURI[],
  sharedWithUserIds?: string[],
}

@singleton()
export default class MediaLibraryWriter {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async create(ownerId: string, name: string, data?: Omit<UpdateData, 'name'>): Promise<bigint> {
    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction) => {
      const createdLibrary = await this.databaseClient.mediaLibrary.create({
        data: {
          ownerId,
          name,
        },

        select: { id: true },
      });

      if (data != null) {
        await this.update(createdLibrary.id, data, transaction);
      }

      return createdLibrary.id;
    });
  }

  async update(id: bigint, data: UpdateData, transaction?: Prisma.TransactionClient): Promise<void> {
    const updatePayload: MediaLibraryUpdateArgs['data'] = {
      name: data.name,
      directoryUris: data.directoryUris?.map(uri => uri.toString()),
    };

    if (data.sharedWithUserIds != null) {
      updatePayload.MediaLibrarySharedWith = {
        deleteMany: {},
        create: data.sharedWithUserIds.map(userId => ({ userId })),
      };
    }

    await (transaction ?? this.databaseClient).mediaLibrary.update({
      where: { id },
      data: updatePayload,
    });
  }
}
