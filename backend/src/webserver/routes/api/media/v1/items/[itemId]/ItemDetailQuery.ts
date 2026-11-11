import Path from 'node:path';
import { NotFoundError } from '@sprax/node-framework';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../../database/prisma-client/client.js';
import {
  ItemQueryFragments,
} from '../../../../../../../plugins/official/media/library/database/media-item/ItemQueryFragments.js';
import {
  MediaQueryFragments,
} from '../../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type ApolloUser from '../../../../../../../user/ApolloUser.js';
import { BaseItemMapper, type BaseItemRow } from '../BaseItemMapper.js';
import type { ItemDetailDto } from './ItemDetailSchemas.js';

/** Whether the media has any numbered item decides the kind; `take: 1` keeps it a bounded lookup instead of a count */
const MEDIA_TYPE_SELECT = {
  media: {
    select: {
      items: { where: { ...ItemQueryFragments.numbered(), ...ItemQueryFragments.present() }, select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.MediaLibraryMediaItemSelect;

type ItemDetailRow = BaseItemRow & Prisma.MediaLibraryMediaItemGetPayload<{
  select: { relativeFilePath: true } & typeof MEDIA_TYPE_SELECT,
}>;

@singleton()
export class ItemDetailQuery {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  /**
   * @throws NotFoundError when the item does not exist or the user cannot access it
   */
  async run(user: ApolloUser, itemId: bigint): Promise<ItemDetailDto> {
    const row = await this.databaseClient.mediaLibraryMediaItem.findFirst({
      where: { AND: [{ id: itemId }, ItemQueryFragments.present(), { media: MediaQueryFragments.accessibleBy(user.id) }] },
      select: {
        ...ItemQueryFragments.BASE_SELECT,
        ...ItemQueryFragments.selectWatchProgressOf(user.id),
        relativeFilePath: true,
        ...MEDIA_TYPE_SELECT,
      },
    });
    if (row == null) {
      throw new NotFoundError(`Item '${itemId}' does not exist or you do not have access to it`);
    }
    return this.toDto(row);
  }

  private toDto(row: ItemDetailRow): ItemDetailDto {
    return {
      ...BaseItemMapper.toDto(row, row.media.items.length > 0 ? 'show' : 'movie'),
      files: [{
        id: row.id.toString(),
        fileName: Path.posix.basename(row.relativeFilePath),
        durationSeconds: row.durationInSec,
      }],
    };
  }
}
