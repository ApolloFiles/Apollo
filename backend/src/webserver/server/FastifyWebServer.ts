import FastifyCookiePlugin from '@fastify/cookie';
import FastifyWebSocketPlugin from '@fastify/websocket';
import * as Sentry from '@sentry/node';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import * as FastifyTypeProviderZod from 'fastify-type-provider-zod';
import Http from 'node:http';
import { injectAll, singleton } from 'tsyringe';
import SessionCookieHelper from '../../auth/session/SessionCookieHelper.js';
import UserBySessionTokenProvider, { type SessionUser } from '../../auth/UserBySessionTokenProvider.js';
import { ContainerTokens } from '../../constants.js';
import type ApolloUser from '../../user/ApolloUser.js';
import { jsonStringifyWithBigInt } from '../../utils/json.js';
import ORPCRequestHandler from '../../utils/orpc/ORPCRequestHandler.js';
import { HttpError, UnauthorizedError } from '../errors/HttpErrors.js';
import type Router from '../routes/Router.js';
import FrontendRequestHandlerFactory from './FrontendRequestHandlerFactory.js';
import InitialRequestRouter from './InitialRequestRouter.js';
import NotFoundHandlerPlugin from './NotFoundHandlerPlugin.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** @internal Use {@link getSessionUser}, {@link getSessionUserOptional} or {@link getAuthenticatedUser} instead */
    _apollo_session_data: SessionUser | null;

    getSessionUserOptional(): SessionUser | null;

    /**
     * @throws {Error} If no user is authenticated for this request
     */
    getSessionUser(): SessionUser;

    /**
     * @throws {Error} If no user is authenticated for this request
     */
    getAuthenticatedUser(): ApolloUser;
  }
}

export type FastifyInstanceWithZod = Fastify.FastifyInstance<
  Fastify.RawServerDefault,
  Fastify.RawRequestDefaultExpression,
  Fastify.RawReplyDefaultExpression,
  Fastify.FastifyBaseLogger,
  FastifyTypeProviderZod.ZodTypeProvider
>;

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstanceWithZod;

  constructor(
    @injectAll(ContainerTokens.ROUTER) routers: Router[],
    oRPCRequestHandler: ORPCRequestHandler,
    sessionCookieHelper: SessionCookieHelper,
    userBySessionTokenProvider: UserBySessionTokenProvider,
  ) {
    this.fastify = Fastify({
      routerOptions: {
        ignoreDuplicateSlashes: true,
        ignoreTrailingSlash: true,

        maxParamLength: 255,
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

    this.fastify.setValidatorCompiler(FastifyTypeProviderZod.validatorCompiler);
    this.fastify.setSerializerCompiler(FastifyTypeProviderZod.serializerCompiler);

    this.fastify.register(FastifyCookiePlugin);
    this.decorateRequestForAuthentication(sessionCookieHelper, userBySessionTokenProvider);

    this.fastify.register(FastifyWebSocketPlugin);

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
        const responseBody = {
          error: 'Request validation failed',
          validation: {
            context: (err as any).validationContext,
            errors: (err as any).validation,
          },
        };

        return reply
          .code(400)
          .type('application/json; charset=utf-8')
          .send(jsonStringifyWithBigInt(responseBody) + '\n');
      }

      console.error(err);
      return reply
        .code(500)
        .send({ error: 'Internal Server Error' });
    });
  }

  private decorateRequestForAuthentication(sessionCookieHelper: SessionCookieHelper, userBySessionTokenProvider: UserBySessionTokenProvider): void {
    this.fastify.decorateRequest('_apollo_session_data', null);

    this.fastify.addHook('preHandler', async (request, reply): Promise<void> => {
      const sessionToken = sessionCookieHelper.extractSessionCookieValue(request.cookies, false);
      if (sessionToken == null) {
        request._apollo_session_data = null;
        return;
      }

      request._apollo_session_data = await userBySessionTokenProvider.findBySessionToken(sessionToken, true);

      if (request._apollo_session_data == null) {
        sessionCookieHelper.unsetCookie(reply, false);
      }
    });

    this.fastify.decorateRequest('getSessionUserOptional', function(): SessionUser | null {
      return this._apollo_session_data;
    });

    this.fastify.decorateRequest('getSessionUser', function(): SessionUser {
      const sessionUser = this.getSessionUserOptional();
      if (sessionUser == null) {
        throw new Error('No user is authenticated for this request');
      }
      return sessionUser;
    });

    this.fastify.decorateRequest('getAuthenticatedUser', function(): ApolloUser {
      return this.getSessionUser().user;
    });
  }

  private registerDefaultHeaders(): void {
    this.fastify.addHook('onRequest', (_request: FastifyRequest, reply: FastifyReply, done: Fastify.HookHandlerDoneFunction): void => {
      reply
        .header('X-Powered-By', 'fastify')
        .header('Content-Security-Policy', `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';`)
        .header('X-Frame-Options', 'DENY')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cross-Origin-Opener-Policy', 'same-origin');
      done();
    });
  }

  private setupRouters(routers: Router[]): void {
    for (const router of routers) {
      this.fastify.register((instance, options) => {
        if (router.allowUnauthenticatedAccess?.() !== true) {
          instance.addHook('preHandler', async (req: FastifyRequest): Promise<void> => {
            const sessionUser = req.getSessionUserOptional();
            if (sessionUser == null) {
              throw new UnauthorizedError();
            }
          });
        }

        router.register(instance, options);
      }, { prefix: router.getRoutePrefix?.() });
    }
  }
}
