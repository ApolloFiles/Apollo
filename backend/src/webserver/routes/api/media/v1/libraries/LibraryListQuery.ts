import { singleton } from 'tsyringe';
import { z } from 'zod';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import {
  LibraryQueryFragments,
} from '../../../../../../plugins/official/media/library/database/library/LibraryQueryFragments.js';
import MediaLibraryUserPreferences
  from '../../../../../../plugins/official/media/library/database/user-preferences/MediaLibraryUserPreferences.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import { KeysetPage, type Page } from '../../../../../public-api/pagination/KeysetPage.js';
import type { PageRequest } from '../../../../../public-api/pagination/PageRequest.js';
import type { MediaLibraryDto } from './MediaLibrarySchema.js';

type LibraryWithPreferencesRow = Prisma.MediaLibraryGetPayload<{
  select: typeof LibraryQueryFragments.SELECT & ReturnType<typeof LibraryQueryFragments.selectUserPreferencesOf>,
}>;

@singleton()
export class LibraryListQuery {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async run(user: ApolloUser, request: PageRequest): Promise<Page<MediaLibraryDto>> {
    const page = KeysetPage.create(request, { column: 'name', order: 'asc', keySchema: z.string() });

    const rows = await this.databaseClient.mediaLibrary.findMany({
      where: { AND: [LibraryQueryFragments.accessibleBy(user.id), page.where()] },
      select: { ...LibraryQueryFragments.SELECT, ...LibraryQueryFragments.selectUserPreferencesOf(user.id) },
      orderBy: page.orderBy(),
      take: page.take,
    });

    return page.toPage(rows, (row) => this.toDto(row, user));
  }

  private toDto(row: LibraryWithPreferencesRow, user: ApolloUser): MediaLibraryDto {
    const preferences = MediaLibraryUserPreferences.fromData(row.mediaLibraryUserPreferences);

    return {
      id: row.id.toString(),
      name: row.name,
      me: {
        role: row.ownerId === user.id ? 'owner' : 'shared',
        preferences: {
          hiddenFromOverview: preferences.hideFromOverview,
          hiddenFromSidebar: preferences.hideFromSidebar,
        },
      },
    };
  }
}
