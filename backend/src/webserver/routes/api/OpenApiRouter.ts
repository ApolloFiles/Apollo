import { type FastifyInstanceWithZod, HttpRouter, type RouteReturn } from '@sprax/node-framework/web';
import { OpenApiDocument } from '../../public-api/OpenApiDocument.js';
import type ApolloRouter from '../../server/ApolloRouter.js';

@HttpRouter()
export class OpenApiRouter implements ApolloRouter {
  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/openapi.json', (request, reply): RouteReturn => {
      return reply
        .type('application/json; charset=utf-8')
        .send(OpenApiDocument.render(server) + '\n');
    });
  }
}
