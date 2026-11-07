import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { API_ERROR_SCHEMA } from '../../../../../public-api/ApiErrorSchema.js';
import { OpenApiDocument } from '../../../../../public-api/OpenApiDocument.js';
import { PageRequest } from '../../../../../public-api/pagination/PageRequest.js';
import { PaginationSchemas } from '../../../../../public-api/pagination/PaginationSchemas.js';
import type ApolloRouter from '../../../../../server/ApolloRouter.js';
import { LibraryListQuery } from './LibraryListQuery.js';
import { MEDIA_LIBRARY_SCHEMA } from './MediaLibrarySchema.js';

@HttpRouter()
export class LibrariesRouter implements ApolloRouter {
  constructor(
    private readonly libraryListQuery: LibraryListQuery,
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
        operationId: 'media_listLibraries',
        summary: 'List the libraries the user owns or has been shared',
        description: 'Ordered by name, then by id',

        querystring: z.object({
          ...PaginationSchemas.createQuery(),
        }),
        response: {
          200: PaginationSchemas.createResponse(MEDIA_LIBRARY_SCHEMA, 'MediaLibraryPage'),
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      const user = request.getAuthenticatedUser();

      reply.serverTiming?.startNext('query');
      const page = await this.libraryListQuery.run(user, PageRequest.fromRequest(request));
      reply.serverTiming?.stopCurrent();

      return reply.send(page);
    });
  }
}
