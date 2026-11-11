import { BadRequestError, NotFoundError } from '@sprax/node-framework';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../../../database/DatabaseClient.js';
import {
  ItemQueryFragments,
} from '../../../../../../../../plugins/official/media/library/database/media-item/ItemQueryFragments.js';
import {
  MediaQueryFragments,
} from '../../../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type ApolloUser from '../../../../../../../../user/ApolloUser.js';

@singleton()
export class WatchProgressWriter {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  /**
   * Positions beyond the end are saved as the duration, so a player reporting a rounded-up end still marks the item watched
   *
   * @throws NotFoundError when the item does not exist or the user cannot access it
   * @throws BadRequestError when `fileId` is not a file of the item
   */
  async save(user: ApolloUser, itemId: bigint, positionSeconds: number, fileId: bigint | undefined): Promise<void> {
    const item = await this.findAccessibleItem(user, itemId);
    if (fileId != null && fileId !== item.id) {
      throw new BadRequestError(`File '${fileId}' does not belong to item '${itemId}'`);
    }

    const durationInSec = Math.min(positionSeconds, item.durationInSec);
    await this.databaseClient.mediaLibraryUserWatchProgress.upsert({
      where: { userId_mediaItemId: { userId: user.id, mediaItemId: item.id } },
      update: { durationInSec },
      create: { userId: user.id, mediaItemId: item.id, durationInSec },
    });
  }

  /**
   * @throws NotFoundError when the item does not exist or the user cannot access it
   */
  async remove(user: ApolloUser, itemId: bigint): Promise<void> {
    const item = await this.findAccessibleItem(user, itemId);

    await this.databaseClient.mediaLibraryUserWatchProgress.deleteMany({
      where: { userId: user.id, mediaItemId: item.id },
    });
  }

  private async findAccessibleItem(user: ApolloUser, itemId: bigint): Promise<{ id: bigint, durationInSec: number }> {
    const item = await this.databaseClient.mediaLibraryMediaItem.findFirst({
      where: { AND: [{ id: itemId }, ItemQueryFragments.present(), { media: MediaQueryFragments.accessibleBy(user.id) }] },
      select: { id: true, durationInSec: true },
    });
    if (item == null) {
      throw new NotFoundError(`Item '${itemId}' does not exist or you do not have access to it`);
    }
    return item;
  }
}
