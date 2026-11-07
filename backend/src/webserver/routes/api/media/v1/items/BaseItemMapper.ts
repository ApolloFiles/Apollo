import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import type {
  ItemQueryFragments,
} from '../../../../../../plugins/official/media/library/database/media-item/ItemQueryFragments.js';
import type { BaseItemDto } from './ItemSchemas.js';

export type BaseItemRow = Prisma.MediaLibraryMediaItemGetPayload<{
  select: typeof ItemQueryFragments.BASE_SELECT & ReturnType<typeof ItemQueryFragments.selectWatchProgressOf>,
}>;

/** @internal */
export class BaseItemMapper {
  static toDto(row: BaseItemRow, mediaType: 'movie' | 'show'): BaseItemDto {
    const watchProgress = row.userWatchProgress[0];

    return {
      id: row.id.toString(),
      mediaId: row.mediaId.toString(),
      kind: mediaType === 'show' ? 'episode' : 'movie',
      title: row.title,
      synopsis: row.synopsis,
      ...(row.seasonNumber != null && { seasonNumber: row.seasonNumber }),
      ...(row.episodeNumber != null && { episodeNumber: row.episodeNumber }),
      durationSeconds: row.durationInSec,
      me: {
        watchProgress: watchProgress != null
          ? { positionSeconds: watchProgress.durationInSec, updatedAt: watchProgress.updatedAt.toISOString() }
          : null,
      },
    };
  }
}
