import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';

/**
 * Reusable parts of queries on `MediaLibrary`
 * @internal
 */
export class LibraryQueryFragments {
  static readonly SELECT = {
    id: true,
    ownerId: true,
    name: true,
  } satisfies Prisma.MediaLibrarySelect;

  /** The set form of the `read-contents` permission: owned by the user or shared with them */
  static accessibleBy(userId: ApolloUser['id']): Prisma.MediaLibraryWhereInput {
    return {
      OR: [
        { ownerId: userId },
        { MediaLibrarySharedWith: { some: { userId } } },
      ],
    };
  }

  static selectUserPreferencesOf(userId: ApolloUser['id']) {
    return {
      mediaLibraryUserPreferences: {
        where: { userId },
        select: { preferenceId: true, value: true },
      },
    } satisfies Prisma.MediaLibrarySelect;
  }
}
