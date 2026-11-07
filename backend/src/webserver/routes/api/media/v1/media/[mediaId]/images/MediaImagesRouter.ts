import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { CacheEntryResponder } from '../../../../../../../../cache/http/CacheEntryResponder.js';
import { API_ERROR_SCHEMA } from '../../../../../../../public-api/ApiErrorSchema.js';
import { API_ID_SCHEMA } from '../../../../../../../public-api/ApiIdSchema.js';
import { OpenApiDocument } from '../../../../../../../public-api/OpenApiDocument.js';
import type ApolloRouter from '../../../../../../../server/ApolloRouter.js';
import { MediaImageQuery } from './MediaImageQuery.js';

const IMAGE_KIND_SCHEMA = z.enum(['poster', 'backdrop', 'logo']);
const IMAGE_FORMAT_SCHEMA = z.enum(['avif', 'jpeg', 'png']);
const IMAGE_BYTES_SCHEMA = z.string().meta({ format: 'binary' });

@HttpRouter()
export class MediaImagesRouter implements ApolloRouter {
  constructor(
    private readonly mediaImageQuery: MediaImageQuery,
    private readonly cacheEntryResponder: CacheEntryResponder,
  ) {
  }

  allowAccessTokenAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/:kind', {
      schema: {
        hide: false,
        tags: [OpenApiDocument.TAG_MEDIA],
        operationId: 'media_getMediaImage',
        summary: 'Get the poster, backdrop or logo of a media',
        description: 'Serves `avif` unless the client asks for another format: it is the format Apollo optimises for. '
          + '`jpeg` and `png` exist for clients that cannot decode AVIF. '
          + 'A poster always exists: Apollo generates one from the title when the media has none. '
          + 'Backdrop and logo answer 404 when the media has none. '
          + 'Responses carry `ETag` and `Last-Modified` and honour `If-None-Match`, `If-Modified-Since` and `Range`.',

        params: z.object({
          mediaId: API_ID_SCHEMA,
          kind: IMAGE_KIND_SCHEMA,
        }),
        querystring: z.object({
          format: IMAGE_FORMAT_SCHEMA
            .default('avif')
            .describe('Every kind is available as `avif`. Available alternatives: `jpeg` for poster and backdrop, `png` for logo'),
        }),
        response: {
          200: {
            description: 'The image in the requested format',
            content: {
              'image/avif': { schema: IMAGE_BYTES_SCHEMA },
              'image/jpeg': { schema: IMAGE_BYTES_SCHEMA },
              'image/png': { schema: IMAGE_BYTES_SCHEMA },
            },
          },
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
          404: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      const { mediaId, kind } = request.params;

      reply.serverTiming?.startNext('image');
      const image = await this.mediaImageQuery.run(request.getAuthenticatedUser(), BigInt(mediaId), kind, request.query.format);
      reply.serverTiming?.stopCurrent();

      return this.cacheEntryResponder.send(request, reply, image, { cacheControl: 'private, max-age=300' });
    });
  }
}
