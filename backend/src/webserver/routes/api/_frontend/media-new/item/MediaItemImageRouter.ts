import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ContainerTokens } from '../../../../../../constants.js';
import MediaLibraryMediaItemFinder
  from '../../../../../../plugins/official/media/library/database/media-item/MediaLibraryMediaItemFinder.js';
import PermissionAwareLibraryMediaItemProvider
  from '../../../../../../plugins/official/media/library/permission-aware/PermissionAwareLibraryMediaItemProvider.js';
import VideoThumbnailProvider
  from '../../../../../../plugins/official/media/library/thumbnail/VideoThumbnailProvider.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MediaImageRouter implements Router {
  private static readonly FILE_NAME_REGEX = /^(thumbnail)\.(jpeg|avif)$/;

  constructor(
    private readonly permissionAwareLibraryMediaItemProvider: PermissionAwareLibraryMediaItemProvider,
    private readonly mediaLibraryMediaItemFinder: MediaLibraryMediaItemFinder,
    private readonly videoThumbnailProvider: VideoThumbnailProvider,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/media-new';
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/item/:mediaItemId/:fileName',
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
        const fileFormatMimeType = `image/${fileFormat}`;

        const mediaItem = await this.permissionAwareLibraryMediaItemProvider.provideForReadContents(requestedMediaItemId, request.getAuthenticatedUser());

        let responseBody: Buffer | null;

        if (fileName === 'thumbnail') {
          const fullMediaItem = await this.mediaLibraryMediaItemFinder.findFullById(mediaItem.mediaItem.id);
          responseBody = await this.videoThumbnailProvider.provide(fullMediaItem!, fileFormat);
        } else {
          throw new Error(`Unsupported fileName: ${JSON.stringify(fileName)}`);
        }

        if (responseBody == null) {
          return reply
            .status(404)
            .send(`Media does not have an image of for '${fileName}'`);
        }

        return reply
          .status(200)
          .header('Cache-Control', 'private, max-age=300')
          .type(fileFormatMimeType)
          .send(responseBody);
      });
  }
}
