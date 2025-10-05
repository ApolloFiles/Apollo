import * as oRpcNodeJs from '@orpc/server/node';
import * as oRpcPlugins from '@orpc/server/plugins';
import * as Sentry from '@sentry/node';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import Http from 'node:http';
import { injectAll, singleton } from 'tsyringe';
import { ContainerTokens } from '../constants.js';
import { oRpcRouter } from '../utils/orpc/oRpcRouter.js';
import { HttpError } from './errors/HttpErrors.js';
import NotFoundHandlerPlugin from './NotFoundHandlerPlugin.js';
import type Router from './routes/Router.js';

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstance;

  constructor(
    @injectAll(ContainerTokens.ROUTER) routers: Router[],
  ) {
    const rpcHandler = new oRpcNodeJs.RPCHandler(oRpcRouter, {
      // FIXME: Configure CORS properly
      plugins: [new oRpcPlugins.CORSPlugin()],
    });

    this.fastify = Fastify({
      routerOptions: {
        ignoreDuplicateSlashes: true,
        ignoreTrailingSlash: true,
      },

      trustProxy: false, // FIXME

      // TODO: Evaluate potential alternatives and performance implications (of using serverFactory for oRPC)
      serverFactory: (fastifyHandler) => {
        return Http.createServer(async (req, res) => {
          const { matched } = await rpcHandler.handle(req, res, {
            context: { headers: req.headers },
            prefix: '/api/_frontend/oRPC',
          });

          if (!matched) {
            fastifyHandler(req, res);
          }
        });
      },
    });

    this.registerErrorHandler();
    this.fastify.register(NotFoundHandlerPlugin);

    this.registerDefaultHeaders();
    this.setupRouters(routers);
  }

  async listen(host: string, port: number): Promise<void> {
    await this.fastify.listen({ host, port });
  }

  async shutdown(): Promise<void> {
    await this.fastify.close();
  }

  private registerErrorHandler(): void {
    Sentry.setupFastifyErrorHandler(this.fastify);

    this.fastify.setErrorHandler((err: Error, _req: FastifyRequest, reply: FastifyReply): FastifyReply => {
      if (err instanceof HttpError) {
        return reply
          .code(err.httpStatusCode)
          .send(err.createResponseBody());
      }

      console.error(err);
      return reply
        .code(500)
        .send({ error: 'Internal Server Error' });
    });
  }

  private registerDefaultHeaders(): void {
    this.fastify.addHook('onRequest', (_request: FastifyRequest, reply: FastifyReply, done: Fastify.HookHandlerDoneFunction): void => {
      reply
        .header('X-Powered-By', 'fastify')
        .header('Content-Security-Policy', `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';`);
      done();
    });
  }

  private setupRouters(routers: Router[]): void {
    for (const router of routers) {
      this.fastify.register((instance, options) => router.register(instance, options), { prefix: router.getRoutePrefix?.() });
    }
  }
}
