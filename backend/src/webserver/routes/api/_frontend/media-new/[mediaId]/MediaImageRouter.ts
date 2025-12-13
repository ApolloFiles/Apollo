import { injectable } from 'tsyringe';
import { z } from 'zod';
import UserByAuthProvider from '../../../../../../auth/UserByAuthProvider.js';
import { ContainerTokens } from '../../../../../../constants.js';
import MediaLibraryMediaFinder
  from '../../../../../../plugins/official/media/library/database/finder/MediaLibraryMediaFinder.js';
import ImageFormatNotSupportedError
  from '../../../../../../plugins/official/media/library/images/error/ImageFormatNotSupportedError.js';
import MediaBackdropImageProvider
  from '../../../../../../plugins/official/media/library/images/MediaBackdropImageProvider.js';
import MediaClearLogoImageProvider
  from '../../../../../../plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import MediaPosterImageProvider
  from '../../../../../../plugins/official/media/library/images/MediaPosterImageProvider.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MediaImageRouter implements Router {
  private static readonly FILE_NAME_REGEX = /^(poster|backdrop|logo)\.(jpeg|avif|png)$/;

  constructor(
    private readonly userByAuthProvider: UserByAuthProvider,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly mediaPosterImageProvider: MediaPosterImageProvider,
    private readonly mediaBackdropImageProvider: MediaBackdropImageProvider,
    private readonly mediaClearLogoImageProvider: MediaClearLogoImageProvider,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/media-new';
  }

  register(server: FastifyInstanceWithZod): void {
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
        const [fileName, fileFormat] = request.params.fileName.split('.') as ['poster' | 'backdrop' | 'logo', 'jpeg' | 'png' | 'avif'];
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

        try {
          if (fileName === 'poster') {
            responseBody = await this.mediaPosterImageProvider.provide(media, fileFormat);
          } else if (fileName === 'backdrop') {
            responseBody = await this.mediaBackdropImageProvider.provide(media, fileFormat);
          } else if (fileName === 'logo') {
            responseBody = await this.mediaClearLogoImageProvider.provide(media, fileFormat);
          } else {
            //noinspection ExceptionCaughtLocallyJS
            throw new Error(`Unsupported fileName: ${JSON.stringify(fileName)}`);
          }
        } catch (err) {
          if (err instanceof ImageFormatNotSupportedError) {
            return reply
              .status(400)
              .send({ error: `Format '${fileFormat}' is not supported for '${fileName}'` });
          }

          throw err;
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
