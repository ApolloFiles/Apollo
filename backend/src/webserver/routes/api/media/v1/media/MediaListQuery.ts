import { singleton } from 'tsyringe';
import { z } from 'zod';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import {
  MediaQueryFragments,
  type BaseMediaRow,
} from '../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import { KeysetPage, type KeysetSort, type Page, type SortOrder } from '../../../../../public-api/pagination/KeysetPage.js';
import type { PageRequest } from '../../../../../public-api/pagination/PageRequest.js';
import type { BaseMediaDto } from './MediaSchemas.js';

export type MediaListParams = {
  /** Empty means every library the user can access */
  libraryIds: bigint[];
  sort: 'addedAt' | 'title';
  order: SortOrder;
};

@singleton()
export class MediaListQuery {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async run(user: ApolloUser, request: PageRequest, params: MediaListParams): Promise<Page<BaseMediaDto>> {
    const page = KeysetPage.create(request, this.sortOf(params), { libraryIds: params.libraryIds.map(String).sort() });

    const rows = await this.databaseClient.mediaLibraryMedia.findMany({
      where: {
        AND: [
          MediaQueryFragments.accessibleBy(user.id),
          params.libraryIds.length > 0 ? { libraryId: { in: params.libraryIds } } : {},
          page.where(),
        ],
      },
      select: MediaQueryFragments.BASE_SELECT,
      orderBy: page.orderBy(),
      take: page.take,
    });

    const showIds = await this.findShowIds(rows.map((row) => row.id));
    return page.toPage(rows, (row) => this.toDto(row, showIds.has(row.id)));
  }

  /** A filtered `_count` in the select would aggregate every item of every media; this stops at the first episode per media */
  private async findShowIds(mediaIds: bigint[]): Promise<Set<bigint>> {
    if (mediaIds.length === 0) {
      return new Set();
    }

    const shows = await this.databaseClient.mediaLibraryMedia.findMany({
      where: { AND: [{ id: { in: mediaIds } }, MediaQueryFragments.withEpisodes()] },
      select: { id: true },
    });
    return new Set(shows.map((show) => show.id));
  }

  /** Snowflake ids are generated at insert time, so "recently added" is id order without timestamp ties */
  private sortOf(params: MediaListParams): KeysetSort<'title' | 'id', string | bigint> {
    if (params.sort === 'title') {
      return { column: 'title', order: params.order, keySchema: z.string() };
    }
    return { column: 'id', order: params.order, keySchema: z.coerce.bigint() };
  }

  private toDto(row: BaseMediaRow, isShow: boolean): BaseMediaDto {
    return {
      id: row.id.toString(),
      libraryId: row.libraryId.toString(),
      type: isShow ? 'show' : 'movie',
      title: row.title,
      year: row.year,
    };
  }
}
