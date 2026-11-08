import { type FastifyInstanceWithZod, HttpRouter } from '@sprax/node-framework/web';
import { z } from 'zod';
import { ApiCsrf } from '../../../../../../../public-api/ApiCsrf.js';
import { API_ERROR_SCHEMA } from '../../../../../../../public-api/ApiErrorSchema.js';
import { API_ID_SCHEMA } from '../../../../../../../public-api/ApiIdSchema.js';
import { OpenApiDocument } from '../../../../../../../public-api/OpenApiDocument.js';
import type ApolloRouter from '../../../../../../../server/ApolloRouter.js';
import { WatchProgressWriter } from './WatchProgressWriter.js';

const PARAMS_SCHEMA = z.object({
  itemId: API_ID_SCHEMA,
});

const SAVE_WATCH_PROGRESS_SCHEMA = z.object({
  positionSeconds: z.number()
    .int()
    .nonnegative()
    .describe('Positions beyond the end are saved as `durationSeconds`, which marks the item as watched'),
  fileId: API_ID_SCHEMA
    .optional()
    .describe('The file the position refers to, one of the item\'s `files`'),
})
  .meta({ id: 'SaveWatchProgress' });

@HttpRouter()
export class WatchProgressRouter implements ApolloRouter {
  constructor(
    private readonly watchProgressWriter: WatchProgressWriter,
  ) {
  }

  allowAccessTokenAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.put('/', {
      schema: {
        hide: false,
        tags: [OpenApiDocument.TAG_MEDIA],
        operationId: 'media_saveWatchProgress',
        summary: 'Save the requesting user\'s position in a movie or episode',
        description: 'To mark an item as watched, send its `durationSeconds` as the position.',

        params: PARAMS_SCHEMA,
        headers: ApiCsrf.HEADERS_SCHEMA,
        body: SAVE_WATCH_PROGRESS_SCHEMA,
        response: {
          204: z.null().describe('Saved'),
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
          404: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      ApiCsrf.requireForCookieSession(request);
      const { positionSeconds, fileId } = request.body;

      reply.serverTiming?.startNext('write');
      await this.watchProgressWriter.save(
        request.getAuthenticatedUser(),
        BigInt(request.params.itemId),
        positionSeconds,
        fileId != null ? BigInt(fileId) : undefined,
      );
      reply.serverTiming?.stopCurrent();

      return reply.code(204).send(null);
    });

    server.delete('/', {
      schema: {
        hide: false,
        tags: [OpenApiDocument.TAG_MEDIA],
        operationId: 'media_deleteWatchProgress',
        summary: 'Forget the requesting user\'s position in a movie or episode',
        description: 'Also succeeds when there was no progress to forget.',

        params: PARAMS_SCHEMA,
        headers: ApiCsrf.HEADERS_SCHEMA,
        response: {
          204: z.null().describe('Forgotten, or there was nothing to forget'),
          400: API_ERROR_SCHEMA,
          401: API_ERROR_SCHEMA,
          404: API_ERROR_SCHEMA,
        },
      },
    }, async (request, reply) => {
      ApiCsrf.requireForCookieSession(request);

      reply.serverTiming?.startNext('write');
      await this.watchProgressWriter.remove(request.getAuthenticatedUser(), BigInt(request.params.itemId));
      reply.serverTiming?.stopCurrent();

      return reply.code(204).send(null);
    });
  }
}
