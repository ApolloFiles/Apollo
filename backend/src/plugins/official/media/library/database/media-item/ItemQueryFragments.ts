import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';

/**
 * Reusable parts of queries on `MediaLibraryMediaItem`
 * @internal
 */
export class ItemQueryFragments {
  static readonly BASE_SELECT = {
    id: true,
    mediaId: true,
    title: true,
    synopsis: true,
    seasonNumber: true,
    episodeNumber: true,
    durationInSec: true,
  } satisfies Prisma.MediaLibraryMediaItemSelect;

  /** Numbered items by season and episode, unnumbered ones after them by title */
  static readonly DISPLAY_ORDER = [
    { seasonNumber: { sort: 'asc', nulls: 'last' } },
    { episodeNumber: { sort: 'asc', nulls: 'last' } },
    { title: 'asc' },
    { id: 'asc' },
  ] satisfies Prisma.MediaLibraryMediaItemOrderByWithRelationInput[];

  /** Items with a season number, i.e. episodes of a show */
  static numbered(): Prisma.MediaLibraryMediaItemWhereInput {
    return { seasonNumber: { not: null } };
  }

  static selectWatchProgressOf(userId: ApolloUser['id']) {
    return {
      userWatchProgress: {
        where: { userId },
        select: { durationInSec: true, updatedAt: true },
      },
    } satisfies Prisma.MediaLibraryMediaItemSelect;
  }
}
