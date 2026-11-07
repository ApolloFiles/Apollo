import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { API_ERROR_SCHEMA } from '../../../../../../public-api/ApiErrorSchema.js';
import { API_ID_SCHEMA } from '../../../../../../public-api/ApiIdSchema.js';
import { OpenApiDocument } from '../../../../../../public-api/OpenApiDocument.js';
import type ApolloRouter from '../../../../../../server/ApolloRouter.js';
import { ItemDetailQuery } from './ItemDetailQuery.js';
import { ITEM_DETAIL_SCHEMA } from './ItemDetailSchemas.js';

@HttpRouter()
export class ItemDetailRouter implements ApolloRouter {
  constructor(
    private readonly itemDetailQuery: ItemDetailQuery,
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
        operationId: 'media_getItem',
        summary: 'Get a movie or episode with its files',

        params: z.object({
          itemId: API_ID_SCHEMA,
        }),
        response: {
          200: ITEM_DETAIL_SCHEMA,
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
          404: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      const user = request.getAuthenticatedUser();

      reply.serverTiming?.startNext('query');
      const item = await this.itemDetailQuery.run(user, BigInt(request.params.itemId));
      reply.serverTiming?.stopCurrent();

      return reply.send(item);
    });
  }
}
