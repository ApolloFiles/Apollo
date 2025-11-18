import * as Sentry from '@sentry/node';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import Http from 'node:http';
import { injectAll, singleton } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import ORPCRequestHandler from '../../utils/orpc/ORPCRequestHandler.js';
import { HttpError } from '../errors/HttpErrors.js';
import type Router from '../routes/Router.js';
import FrontendRequestHandlerFactory from './FrontendRequestHandlerFactory.js';
import InitialRequestRouter from './InitialRequestRouter.js';
import NotFoundHandlerPlugin from './NotFoundHandlerPlugin.js';

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstance;

  constructor(
    @injectAll(ContainerTokens.ROUTER) routers: Router[],
    oRPCRequestHandler: ORPCRequestHandler,
  ) {
    this.fastify = Fastify({
      routerOptions: {
        ignoreDuplicateSlashes: true,
        ignoreTrailingSlash: true,

        // FIXME: Remove when MediaRouter's '/:libraryId/:titleId/:mediaItemPathBase64/thumbnail.png' no longer exists
        //        or actually... maybe come up with a sensible value (e.g. expected max file name length?)
        maxParamLength: 10 * 1024,
      },

      trustProxy: false, // FIXME

      // TODO: Evaluate potential alternatives and performance implications (of using serverFactory for oRPC)
      serverFactory: (fastifyHandler) => {
        const initialRequestRouter = new InitialRequestRouter(oRPCRequestHandler, fastifyHandler, new FrontendRequestHandlerFactory().create());
        return Http.createServer((req, res): Promise<void> => {
          return initialRequestRouter.route(req, res);
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

      if ((err as any).code === 'FST_ERR_VALIDATION') {
        return reply
          .code(400)
          .send({
            error: 'Bad Request (Validation Error)',
            validation: {
              context: (err as any).validationContext,
              errors: (err as any).validation,
            },
          });
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
