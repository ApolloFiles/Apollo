import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { API_ERROR_SCHEMA } from '../../../../../../public-api/ApiErrorSchema.js';
import { OpenApiDocument } from '../../../../../../public-api/OpenApiDocument.js';
import { PaginationSchemas } from '../../../../../../public-api/pagination/PaginationSchemas.js';
import type ApolloRouter from '../../../../../../server/ApolloRouter.js';
import { LIBRARY_ID_FILTER_SCHEMA } from '../../libraries/LibraryIdFilterSchema.js';
import { ContinueWatchingQuery } from './ContinueWatchingQuery.js';
import { CONTINUE_WATCHING_LIST_SCHEMA } from './ContinueWatchingSchemas.js';

@HttpRouter()
export class ContinueWatchingRouter implements ApolloRouter {
  constructor(
    private readonly continueWatchingQuery: ContinueWatchingQuery,
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
        operationId: 'media_listContinueWatching',
        summary: 'List what the user can continue watching',
        description: 'One entry per media the user has started, most recently watched first. '
          + 'The entry\'s item is the one to play: the item the user is in the middle of, '
          + 'or the one after it (once Apollo considers that one watched). '
          + 'Media whose last item is watched are left out. '
          + 'Libraries the user cannot access are ignored, not rejected. '
          + 'Not paginated: the response holds at most `limit` entries.',

        querystring: z.object({
          libraryId: LIBRARY_ID_FILTER_SCHEMA,
          limit: PaginationSchemas.createLimit({ defaultLimit: 20, maxLimit: 50 }),
        }),
        response: {
          200: CONTINUE_WATCHING_LIST_SCHEMA,
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      const { libraryId, limit } = request.query;

      reply.serverTiming?.startNext('query');
      const list = await this.continueWatchingQuery.run(request.getAuthenticatedUser(), { libraryIds: libraryId, limit });
      reply.serverTiming?.stopCurrent();

      return reply.send(list);
    });
  }
}
