import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { API_ERROR_SCHEMA } from '../../../../../public-api/ApiErrorSchema.js';
import { OpenApiDocument } from '../../../../../public-api/OpenApiDocument.js';
import type { SortOrder } from '../../../../../public-api/pagination/KeysetPage.js';
import { PageRequest } from '../../../../../public-api/pagination/PageRequest.js';
import { PaginationSchemas } from '../../../../../public-api/pagination/PaginationSchemas.js';
import type ApolloRouter from '../../../../../server/ApolloRouter.js';
import { LIBRARY_ID_FILTER_SCHEMA } from '../libraries/LibraryIdFilterSchema.js';
import { type MediaListParams, MediaListQuery } from './MediaListQuery.js';
import { BASE_MEDIA_SCHEMA } from './MediaSchemas.js';

@HttpRouter()
export class MediaRouter implements ApolloRouter {
  private static readonly DEFAULT_ORDER: Record<MediaListParams['sort'], SortOrder> = { addedAt: 'desc', title: 'asc' };

  constructor(
    private readonly mediaListQuery: MediaListQuery,
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
        operationId: 'media_listMedia',
        summary: 'List movies and shows',
        description: 'Lists the media of the given libraries, or of every library the user can access. Libraries the user cannot access are ignored, not rejected.',

        querystring: z.object({
          ...PaginationSchemas.createQuery(),

          libraryId: LIBRARY_ID_FILTER_SCHEMA,
          sort: z.enum(['addedAt', 'title'])
            .default('addedAt'),
          order: z.enum(['asc', 'desc'])
            .optional()
            .describe('Defaults to `desc` for `addedAt` and `asc` for `title`'),
        }),
        response: {
          200: PaginationSchemas.createResponse(BASE_MEDIA_SCHEMA, 'MediaPage'),
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      const user = request.getAuthenticatedUser();
      const { libraryId, sort, order } = request.query;

      reply.serverTiming?.startNext('query');
      const page = await this.mediaListQuery.run(user, PageRequest.fromRequest(request), {
        libraryIds: libraryId,
        sort,
        order: order ?? MediaRouter.DEFAULT_ORDER[sort],
      });
      reply.serverTiming?.stopCurrent();

      return reply.send(page);
    });
  }
}
