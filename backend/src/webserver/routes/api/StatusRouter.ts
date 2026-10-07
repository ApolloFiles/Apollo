import { HttpRouter, type RouteReturn } from '@sprax/node-framework/web';
import type { FastifyInstance } from 'fastify';
import type ApolloRouter from '../../server/ApolloRouter.js';

@HttpRouter()
export default class StatusRouter implements ApolloRouter {
  register(server: FastifyInstance): void {
    server.get('/status', (request, reply): RouteReturn => {
      return reply.send({ online: true });
    });
  }
}
