import { injectable } from 'tsyringe';
import { z } from 'zod';
import UserByAuthProvider from '../../../../../../auth/UserByAuthProvider.js';
import { ContainerTokens } from '../../../../../../constants.js';
import MediaLibraryMediaFinder
  from '../../../../../../plugins/official/media/library/database/finder/MediaLibraryMediaFinder.js';
import MediaBackdropImageProvider
  from '../../../../../../plugins/official/media/library/files/MediaBackdropImageProvider.js';
import MediaPosterImageProvider
  from '../../../../../../plugins/official/media/library/files/MediaPosterImageProvider.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MediaImageRouter implements Router {
  private static readonly FILE_NAME_REGEX = /^(poster|backdrop)\.(jpeg|avif)$/;

  constructor(
    private readonly userByAuthProvider: UserByAuthProvider,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly mediaPosterImageProvider: MediaPosterImageProvider,
    private readonly mediaBackdropImageProvider: MediaBackdropImageProvider,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/media-new';
  }

  register(server: FastifyInstanceWithZod): void {
    // TODO: Add some nice Cache headers
    server.get('/:mediaId/:fileName',
      {
        schema: {
          params: z.object({
            mediaId: z.coerce.bigint().positive(),
            fileName: z.string().regex(MediaImageRouter.FILE_NAME_REGEX),
          }),
        },
      },
      async (request, reply): Promise<RouteReturn> => {
        const requestedMediaId = request.params.mediaId;
        const [fileName, fileFormat] = request.params.fileName.split('.') as ['poster' | 'backdrop', 'jpeg' | 'avif'];
        const fileFormatMimeType = `image/${fileFormat}`;

        const apolloUser = await this.userByAuthProvider.provideByHeaders(request.headers);
        if (apolloUser == null) {
          return reply
            .status(401)
            .send({ error: 'Unauthorized' });
        }

        const media = await this.mediaLibraryMediaFinder.findForUserById(apolloUser, requestedMediaId);
        if (media == null) {
          return reply
            .status(404)
            .send({
              error: `Media with id '${requestedMediaId.toString()}' does not exist or you do not have access to it`,
            });
        }

        let responseBody: Buffer | null;

        if (fileName === 'poster') {
          responseBody = await this.mediaPosterImageProvider.provide(media, fileFormat);
        } else if (fileName === 'backdrop') {
          responseBody = await this.mediaBackdropImageProvider.provide(media, fileFormat);
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
          .type(fileFormatMimeType)
          .send(responseBody);
      });
  }
}
