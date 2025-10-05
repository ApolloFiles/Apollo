import type { FastifyInstance } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens, IS_PRODUCTION } from '../../constants.js';
import type { default as Router, RouteReturn } from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class DevModeRouter implements Router {
  register(server: FastifyInstance): void {
    if (IS_PRODUCTION) {
      return;
    }

    server.get('/', (request, reply): RouteReturn => {
      return reply
        .type('text/html; charset=utf-8')
        .send('DEV MODE – The frontend should be at <a href="http://localhost:5177/">http://localhost:5177/</a>');
    });
  }
}
