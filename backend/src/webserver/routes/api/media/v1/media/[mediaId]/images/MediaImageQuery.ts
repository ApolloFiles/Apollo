import { BadRequestError, NotFoundError } from '@sprax/node-framework';
import { singleton } from 'tsyringe';
import type { CachedValue } from '../../../../../../../../cache/CacheEntry.js';
import DatabaseClient from '../../../../../../../../database/DatabaseClient.js';
import FullLibraryMedia from '../../../../../../../../plugins/official/media/library/database/media/FullLibraryMedia.js';
import {
  MediaQueryFragments,
} from '../../../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type AbstractMediaImageProvider from '../../../../../../../../plugins/official/media/library/images/AbstractMediaImageProvider.js';
import type { ImageFormat, ImageType } from '../../../../../../../../plugins/official/media/library/images/AbstractMediaImageProvider.js';
import ImageFormatNotSupportedError
  from '../../../../../../../../plugins/official/media/library/images/error/ImageFormatNotSupportedError.js';
import MediaBackdropImageProvider
  from '../../../../../../../../plugins/official/media/library/images/MediaBackdropImageProvider.js';
import MediaClearLogoImageProvider
  from '../../../../../../../../plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import MediaPosterImageProvider from '../../../../../../../../plugins/official/media/library/images/MediaPosterImageProvider.js';
import type ApolloUser from '../../../../../../../../user/ApolloUser.js';

@singleton()
export class MediaImageQuery {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly posterImageProvider: MediaPosterImageProvider,
    private readonly backdropImageProvider: MediaBackdropImageProvider,
    private readonly clearLogoImageProvider: MediaClearLogoImageProvider,
  ) {
  }

  /**
   * @throws NotFoundError when the media does not exist, the user cannot access it, or it has no such image
   * @throws BadRequestError when the format is not available for the kind
   */
  async run(user: ApolloUser, mediaId: bigint, kind: ImageType, format: ImageFormat): Promise<CachedValue<Buffer>> {
    const media = await this.findAccessible(user, mediaId);
    if (media == null) {
      throw new NotFoundError(`Media '${mediaId}' does not exist or you do not have access to it`);
    }

    const image = await this.provide(media, kind, format);
    if (image == null) {
      throw new NotFoundError(`Media '${mediaId}' has no ${kind}`);
    }
    return image;
  }

  private async provide(media: FullLibraryMedia, kind: ImageType, format: ImageFormat): Promise<CachedValue<Buffer> | null> {
    try {
      return await this.providerFor(kind).provide(media, format);
    } catch (err) {
      if (err instanceof ImageFormatNotSupportedError) {
        throw new BadRequestError(`Format '${format}' is not available for '${kind}'`);
      }
      throw err;
    }
  }

  private providerFor(kind: ImageType): AbstractMediaImageProvider {
    switch (kind) {
      case 'poster':
        return this.posterImageProvider;
      case 'backdrop':
        return this.backdropImageProvider;
      case 'logo':
        return this.clearLogoImageProvider;
    }
  }

  private async findAccessible(user: ApolloUser, mediaId: bigint): Promise<FullLibraryMedia | null> {
    const row = await this.databaseClient.mediaLibraryMedia.findFirst({
      where: { AND: [{ id: mediaId }, MediaQueryFragments.accessibleBy(user.id)] },
      select: {
        id: true,
        title: true,
        synopsis: true,
        year: true,
        addedAt: true,
        externalApiFetchedAt: true,
        directoryUri: true,
        library: { select: { id: true, ownerId: true } },
      },
    });
    return row != null ? FullLibraryMedia.fromData(row) : null;
  }
}
