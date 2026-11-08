import { NotFoundError } from '@sprax/node-framework';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../../database/prisma-client/client.js';
import type { MediaLibraryMediaExternalIdSource } from '../../../../../../../database/prisma-client/enums.js';
import ContinueWatchingProvider from '../../../../../../../plugins/official/media/library/ContinueWatchingProvider.js';
import {
  ItemQueryFragments,
} from '../../../../../../../plugins/official/media/library/database/media-item/ItemQueryFragments.js';
import {
  MediaQueryFragments,
} from '../../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type ApolloUser from '../../../../../../../user/ApolloUser.js';
import { BaseItemMapper, type BaseItemRow } from '../../items/BaseItemMapper.js';
import type { BaseItemDto } from '../../items/ItemSchemas.js';
import { BaseMediaMapper } from '../BaseMediaMapper.js';
import type { MediaDetailDto } from './MediaDetailSchemas.js';

const EXTERNAL_IDS_SELECT = {
  mediaLibraryMediaExternalIds: { select: { source: true, externalId: true } },
} satisfies Prisma.MediaLibraryMediaSelect;

type MediaDetailRow = Prisma.MediaLibraryMediaGetPayload<{
  select: typeof MediaQueryFragments.BASE_SELECT & { synopsis: true } & typeof EXTERNAL_IDS_SELECT,
}> & { items: BaseItemRow[] };

type MediaType = MediaDetailDto['type'];
type SeasonDto = NonNullable<MediaDetailDto['seasons']>[number];

@singleton()
export class MediaDetailQuery {
  private static readonly EXTERNAL_ID_KEYS: Record<MediaLibraryMediaExternalIdSource, keyof MediaDetailDto['externalIds']> = {
    THE_MOVIE_DB: 'tmdb',
    IMDB: 'imdb',
    THE_TV_DB: 'tvdb',
  };

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly continueWatchingProvider: ContinueWatchingProvider,
  ) {
  }

  /**
   * @throws NotFoundError when the media does not exist or the user cannot access it
   */
  async run(user: ApolloUser, mediaId: bigint): Promise<MediaDetailDto> {
    const row = await this.databaseClient.mediaLibraryMedia.findFirst({
      where: { AND: [{ id: mediaId }, MediaQueryFragments.accessibleBy(user.id)] },
      select: {
        ...MediaQueryFragments.BASE_SELECT,
        synopsis: true,
        ...EXTERNAL_IDS_SELECT,
        items: {
          select: { ...ItemQueryFragments.BASE_SELECT, ...ItemQueryFragments.selectWatchProgressOf(user.id) },
          orderBy: ItemQueryFragments.DISPLAY_ORDER,
        },
      },
    });
    if (row == null) {
      throw new NotFoundError(`Media '${mediaId}' does not exist or you do not have access to it`);
    }

    const nextItem = await this.continueWatchingProvider.resolveNextForMedia(user, mediaId);
    return this.toDto(row, nextItem?.item.id ?? null);
  }

  private toDto(row: MediaDetailRow, nextItemId: bigint | null): MediaDetailDto {
    const type: MediaType = row.items.some((item) => item.seasonNumber != null) ? 'show' : 'movie';
    const items = row.items.map((item) => BaseItemMapper.toDto(item, type));

    return {
      ...BaseMediaMapper.toDto(row, type),
      synopsis: row.synopsis,
      externalIds: this.toExternalIds(row.mediaLibraryMediaExternalIds),
      me: { nextItemToWatch: items.find((item) => item.id === nextItemId?.toString()) ?? null },
      items: items.filter((item) => item.seasonNumber == null),
      ...(type === 'show' && { seasons: this.groupIntoSeasons(items.filter((item) => item.seasonNumber != null)) }),
    };
  }

  private toExternalIds(rows: MediaDetailRow['mediaLibraryMediaExternalIds']): MediaDetailDto['externalIds'] {
    const externalIds: MediaDetailDto['externalIds'] = {};
    for (const row of rows) {
      externalIds[MediaDetailQuery.EXTERNAL_ID_KEYS[row.source]] = row.externalId;
    }
    return externalIds;
  }

  /** Items arrive in display order, so the seasons come out ascending */
  private groupIntoSeasons(numberedItems: BaseItemDto[]): SeasonDto[] {
    const itemsBySeason = new Map<number, BaseItemDto[]>();
    for (const item of numberedItems) {
      const seasonItems = itemsBySeason.get(item.seasonNumber!) ?? [];
      seasonItems.push(item);
      itemsBySeason.set(item.seasonNumber!, seasonItems);
    }
    return Array.from(itemsBySeason, ([seasonNumber, items]) => ({ seasonNumber, items }));
  }
}
