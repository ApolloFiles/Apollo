import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ContainerTokens } from '../../../../../../constants.js';
import MediaLibraryMediaItemFinder
  from '../../../../../../plugins/official/media/library/database/finder/MediaLibraryMediaItemFinder.js';
import VideoThumbnailProvider
  from '../../../../../../plugins/official/media/library/thumbnail/VideoThumbnailProvider.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MediaImageRouter implements Router {
  private static readonly FILE_NAME_REGEX = /^(thumbnail)\.(jpeg|avif)$/;

  constructor(
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

        const mediaItem = await this.mediaLibraryMediaItemFinder.findForUserById(request.getAuthenticatedUser(), requestedMediaItemId);
        if (mediaItem == null) {
          return reply
            .status(404)
            .send({
              error: `MediaItem with id '${requestedMediaItemId.toString()}' does not exist or you do not have access to it`,
            });
        }

        let responseBody: Buffer | null;

        if (fileName === 'thumbnail') {
          responseBody = await this.videoThumbnailProvider.provide(mediaItem, fileFormat);
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
