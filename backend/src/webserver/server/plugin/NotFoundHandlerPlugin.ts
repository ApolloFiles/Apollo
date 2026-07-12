import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import { NotFoundError } from '../../errors/HttpErrors.js';
import type { RouteReturn } from '../../routes/Router.js';

export default fastifyPlugin(registerPlugin);

const CANDIDATE_METHODS = ['HEAD', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as const;

function registerPlugin(instance: FastifyInstance, _opts: FastifyPluginOptions, done: (err?: Error) => void): void {
  instance.setNotFoundHandler((request, reply): RouteReturn => {
    const requestPath = request.url.split('?')[0];
    const allowedMethods = CANDIDATE_METHODS.filter((method) => instance.findRoute({ method, url: requestPath }) != null);

    if (allowedMethods.length > 0) {
      return reply
        .status(405)
        .header('Allow', allowedMethods.join(', '))
        .send('Method Not Allowed');
    }

    throw new NotFoundError();
  });

  done();
}
