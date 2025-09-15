import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import { NotFoundError } from './errors/HttpErrors.js';
import type { RouteReturn } from './routes/Router.js';

export default fastifyPlugin(registerPlugin);

function registerPlugin(instance: FastifyInstance, _opts: FastifyPluginOptions, done: (err?: Error) => void): void {
  const knownRoutes = new Map<string, string[]>();

  instance.addHook('onRoute', (routeOptions): void => {
    const knownMethods = knownRoutes.get(routeOptions.path) ?? [];
    const methodsToRegister = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];

    for (const method of methodsToRegister) {
      if (!knownMethods.includes(method)) {
        knownMethods.push(method);
        instance.log.debug(`[NotFoundHandlerPlugin] Found ${method} ${routeOptions.path}`);
      }
    }
    knownRoutes.set(routeOptions.path, knownMethods);
  });

  instance.setNotFoundHandler((request, reply): RouteReturn => {
    const knownMethods = knownRoutes.get(request.url.split('?')[0]);
    if (knownMethods != null) {
      return reply
        .status(405)
        .header('Allow', knownMethods.join(', ').toUpperCase())
        .send('Method Not Allowed');
    }

    throw new NotFoundError();
  });

  done();
}
