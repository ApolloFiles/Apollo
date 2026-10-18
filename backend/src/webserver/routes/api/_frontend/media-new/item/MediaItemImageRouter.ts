import { type FastifyInstanceWithZod, HttpRouter, type RouteReturn } from '@sprax/node-framework/web';
import { z } from 'zod';
import { CacheEntryResponder } from '../../../../../../cache/http/CacheEntryResponder.js';
import MediaLibraryMediaItemFinder
  from '../../../../../../plugins/official/media/library/database/media-item/MediaLibraryMediaItemFinder.js';
import PermissionAwareLibraryMediaItemProvider
  from '../../../../../../plugins/official/media/library/permission-aware/PermissionAwareLibraryMediaItemProvider.js';
import VideoThumbnailProvider
  from '../../../../../../plugins/official/media/library/thumbnail/VideoThumbnailProvider.js';
import type ApolloRouter from '../../../../../server/ApolloRouter.js';

@HttpRouter()
export default class MediaImageRouter implements ApolloRouter {
  private static readonly FILE_NAME_REGEX = /^(thumbnail)\.(jpeg|avif)$/;

  constructor(
    private readonly permissionAwareLibraryMediaItemProvider: PermissionAwareLibraryMediaItemProvider,
    private readonly mediaLibraryMediaItemFinder: MediaLibraryMediaItemFinder,
    private readonly videoThumbnailProvider: VideoThumbnailProvider,
    private readonly cacheEntryResponder: CacheEntryResponder,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/:mediaItemId/:fileName',
      {
        schema: {
          params: z.object({
            mediaItemId: z.coerce.bigint().positive(),
            fileName: z.string().regex(MediaImageRouter.FILE_NAME_REGEX),
          }),
        },
      },
      async (request, reply): Promise<RouteReturn> => {
        const requestedMediaItemId = request.params.mediaItemId;
        const [fileName, fileFormat] = request.params.fileName.split('.') as ['thumbnail', 'jpeg' | 'avif'];
        if (fileName !== 'thumbnail') {
          throw new Error(`Unsupported fileName: ${JSON.stringify(fileName)}`);
        }

        const mediaItem = await this.permissionAwareLibraryMediaItemProvider.provideForReadContents(requestedMediaItemId, request.getAuthenticatedUser());
        const fullMediaItem = await this.mediaLibraryMediaItemFinder.findFullById(mediaItem.mediaItem.id);
        const cacheEntry = await this.videoThumbnailProvider.provide(fullMediaItem!, fileFormat);

        return this.cacheEntryResponder.send(request, reply, cacheEntry, { cacheControl: 'private, max-age=300' });
      });
  }
}
