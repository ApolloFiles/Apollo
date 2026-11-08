import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../../database/prisma-client/client.js';
import ContinueWatchingProvider from '../../../../../../../plugins/official/media/library/ContinueWatchingProvider.js';
import {
  ItemQueryFragments,
} from '../../../../../../../plugins/official/media/library/database/media-item/ItemQueryFragments.js';
import {
  MediaQueryFragments,
} from '../../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type ApolloUser from '../../../../../../../user/ApolloUser.js';
import { BaseItemMapper, type BaseItemRow } from '../../items/BaseItemMapper.js';
import { BaseMediaMapper } from '../../media/BaseMediaMapper.js';
import type { ContinueWatchingEntryDto, ContinueWatchingListDto } from './ContinueWatchingSchemas.js';

export type ContinueWatchingParams = {
  /** Empty means every library the user can access */
  libraryIds: bigint[];
  limit: number;
};

/** Whether the media has any numbered item decides its type; `take: 1` keeps it a bounded lookup instead of a count */
const ENTRY_SELECT = {
  media: {
    select: {
      ...MediaQueryFragments.BASE_SELECT,
      items: { where: ItemQueryFragments.numbered(), select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.MediaLibraryMediaItemSelect;

type EntryRow = BaseItemRow & Prisma.MediaLibraryMediaItemGetPayload<{ select: typeof ENTRY_SELECT }>;

@singleton()
export class ContinueWatchingQuery {
  /** Bounds the history read per request, as the web overview does; media watched only before that are not continued */
  private static readonly RECENT_PROGRESS_ROWS = 100;

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly continueWatchingProvider: ContinueWatchingProvider,
  ) {
  }

  async run(user: ApolloUser, params: ContinueWatchingParams): Promise<ContinueWatchingListDto> {
    const startedMediaIds = await this.findStartedMediaIds(user, params.libraryIds);
    const nextItemIds = await this.resolveNextItemIds(user, startedMediaIds, params.limit);

    return { items: await this.toDtos(user, nextItemIds) };
  }

  /** Most recently watched first, among the user's most recent progress rows */
  private async findStartedMediaIds(user: ApolloUser, libraryIds: bigint[]): Promise<bigint[]> {
    const rows = await this.databaseClient.mediaLibraryUserWatchProgress.findMany({
      where: {
        userId: user.id,
        mediaItem: {
          media: {
            AND: [
              MediaQueryFragments.accessibleBy(user.id),
              libraryIds.length > 0 ? { libraryId: { in: libraryIds } } : {},
            ],
          },
        },
      },
      select: { mediaItem: { select: { mediaId: true } } },
      orderBy: [{ updatedAt: 'desc' }, { mediaItemId: 'desc' }],
      take: ContinueWatchingQuery.RECENT_PROGRESS_ROWS,
    });
    return [...new Set(rows.map((row) => row.mediaItem.mediaId))];
  }

  /** Media whose last item is finished have nothing to continue and are skipped, so this may examine more media than it returns */
  private async resolveNextItemIds(user: ApolloUser, startedMediaIds: bigint[], count: number): Promise<bigint[]> {
    const nextItemIds: bigint[] = [];
    for (const mediaId of startedMediaIds) {
      if (nextItemIds.length >= count) {
        break;
      }

      const next = await this.continueWatchingProvider.resolveNextForMedia(user, mediaId);
      if (next != null) {
        nextItemIds.push(next.item.id);
      }
    }
    return nextItemIds;
  }

  private async toDtos(user: ApolloUser, itemIds: bigint[]): Promise<ContinueWatchingEntryDto[]> {
    const rows = await this.databaseClient.mediaLibraryMediaItem.findMany({
      where: { id: { in: itemIds } },
      select: { ...ItemQueryFragments.BASE_SELECT, ...ItemQueryFragments.selectWatchProgressOf(user.id), ...ENTRY_SELECT },
    });

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    return itemIds.flatMap((itemId) => {
      const row = rowsById.get(itemId);
      // A rescan can delete the item between resolving it and loading it here
      return row != null ? [this.toDto(row)] : [];
    });
  }

  private toDto(row: EntryRow): ContinueWatchingEntryDto {
    const mediaType = row.media.items.length > 0 ? 'show' : 'movie';
    return {
      media: BaseMediaMapper.toDto(row.media, mediaType),
      item: BaseItemMapper.toDto(row, mediaType),
    };
  }
}
