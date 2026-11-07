import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import { LibraryQueryFragments } from '../library/LibraryQueryFragments.js';

export type BaseMediaRow = Prisma.MediaLibraryMediaGetPayload<{ select: typeof MediaQueryFragments.BASE_SELECT }>;

/**
 * Reusable parts of queries on `MediaLibraryMedia`
 * @internal
 */
export class MediaQueryFragments {
  static readonly BASE_SELECT = {
    id: true,
    libraryId: true,
    title: true,
    year: true,
  } satisfies Prisma.MediaLibraryMediaSelect;

  static accessibleBy(userId: ApolloUser['id']): Prisma.MediaLibraryMediaWhereInput {
    return { library: LibraryQueryFragments.accessibleBy(userId) };
  }

  /** Media with at least one numbered item, i.e. a show rather than a movie */
  static withEpisodes(): Prisma.MediaLibraryMediaWhereInput {
    return { items: { some: { seasonNumber: { not: null } } } };
  }
}
