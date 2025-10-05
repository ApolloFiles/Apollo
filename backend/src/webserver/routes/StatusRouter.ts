import type { FastifyInstance } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import type { default as Router, RouteReturn } from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class StatusRouter implements Router {
  register(server: FastifyInstance): void {
    server.get('/api/status', (request, reply): RouteReturn => {
      return reply.send({ online: true });
    });
  }
}
