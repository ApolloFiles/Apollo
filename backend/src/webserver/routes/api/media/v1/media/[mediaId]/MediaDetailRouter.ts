import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { API_ERROR_SCHEMA } from '../../../../../../public-api/ApiErrorSchema.js';
import { API_ID_SCHEMA } from '../../../../../../public-api/ApiIdSchema.js';
import { OpenApiDocument } from '../../../../../../public-api/OpenApiDocument.js';
import type ApolloRouter from '../../../../../../server/ApolloRouter.js';
import { MediaDetailQuery } from './MediaDetailQuery.js';
import { MEDIA_DETAIL_SCHEMA } from './MediaDetailSchemas.js';

@HttpRouter()
export class MediaDetailRouter implements ApolloRouter {
  constructor(
    private readonly mediaDetailQuery: MediaDetailQuery,
  ) {
  }

  allowAccessTokenAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/', {
      schema: {
        hide: false,
        tags: [OpenApiDocument.TAG_MEDIA],
        operationId: 'media_getMedia',
        summary: 'Get a movie or show with its items',
        description: 'Items are listed in display order; clients should usually not reorder them',

        params: z.object({
          mediaId: API_ID_SCHEMA,
        }),
        response: {
          200: MEDIA_DETAIL_SCHEMA,
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
          404: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      const user = request.getAuthenticatedUser();

      reply.serverTiming?.startNext('query');
      const detail = await this.mediaDetailQuery.run(user, BigInt(request.params.mediaId));
      reply.serverTiming?.stopCurrent();

      return reply.send(detail);
    });
  }
}
