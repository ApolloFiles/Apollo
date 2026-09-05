import FastifyCookiePlugin from '@fastify/cookie';
import FastifyFormBodyPlugin from '@fastify/formbody';
import FastifyWebSocketPlugin from '@fastify/websocket';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import * as FastifyTypeProviderZod from 'fastify-type-provider-zod';
import Http from 'node:http';
import { injectAll, singleton } from 'tsyringe';
import AccessTokenBearerHelper from '../../auth/access_token/AccessTokenBearerHelper.js';
import type { AccessTokenUser } from '../../auth/access_token/UserByAccessTokenProvider.js';
import CsrfTokenValidator from '../../auth/CsrfTokenValidator.js';
import SessionCookieHelper from '../../auth/session/SessionCookieHelper.js';
import UserBySessionTokenProvider, { type SessionUser } from '../../auth/UserBySessionTokenProvider.js';
import { ContainerTokens } from '../../constants.js';
import type ApolloUser from '../../user/ApolloUser.js';
import { jsonStringifyWithBigInt } from '../../utils/json.js';
import { BadRequestError, HttpError, UnauthorizedError } from '../errors/HttpErrors.js';
import type Router from '../routes/Router.js';
import FrontendRequestHandlerFactory from './FrontendRequestHandlerFactory.js';
import InitialRequestRouter from './InitialRequestRouter.js';
import ORPCRequestHandler from './ORPCRequestHandler.js';
import NotFoundHandlerPlugin from './plugin/NotFoundHandlerPlugin.js';
import ServerTimingHeaderPlugin from './plugin/ServerTiming/ServerTimingHeaderPlugin.js';

export type RequestAuthentication =
  | ({ kind: 'session' } & SessionUser)
  | ({ kind: 'accessToken' } & AccessTokenUser);

declare module 'fastify' {
  interface FastifyRequest {
    /** @internal Use {@link getSessionUser}, {@link getSessionUserOptional} or {@link getAuthenticatedUser} instead */
    _apollo_auth_data: RequestAuthentication | null;

    /** Only resolves a cookie session – a request authenticated by an access token yields `null`. */
    getSessionUserOptional(): SessionUser | null;

    /**
     * @throws {Error} If no cookie session exists for this request
     */
    getSessionUser(): SessionUser;

    /** Resolves a cookie session as well as an access token. */
    getAuthenticatedUserOptional(): ApolloUser | null;

    /**
     * @throws {Error} If no user is authenticated for this request
     */
    getAuthenticatedUser(): ApolloUser;

    /**
     * Validates `sentToken` against the current authenticated session's CSRF token.
     * @throws {BadRequestError} If no session exists for this request, or the token is missing or does not match
     */
    requireCsrf(sentToken: string | undefined): void;
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
    csrfTokenValidator: CsrfTokenValidator,
    private readonly accessTokenBearerHelper: AccessTokenBearerHelper,
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

    this.fastify.register(ServerTimingHeaderPlugin);

    this.registerErrorHandler();
    this.fastify.register(NotFoundHandlerPlugin);

    this.fastify.setValidatorCompiler(FastifyTypeProviderZod.validatorCompiler);
    this.fastify.setSerializerCompiler(FastifyTypeProviderZod.serializerCompiler);

    this.fastify.register(FastifyCookiePlugin);
    this.decorateRequestForAuthentication(sessionCookieHelper, userBySessionTokenProvider);
    this.decorateRequestForCsrfValidation(csrfTokenValidator);

    this.fastify.register(FastifyFormBodyPlugin, { bodyLimit: 1024 * 1024 /* 1 MiB */ });
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
    this.fastify.decorateRequest('_apollo_auth_data', null);

    this.fastify.addHook('preHandler', async (request, reply): Promise<void> => {
      reply.serverTiming?.startNext('auth');

      const sessionToken = sessionCookieHelper.extractSessionCookieValue(request.cookies, false);
      if (sessionToken == null) {
        request._apollo_auth_data = null;

        reply.serverTiming?.stopCurrent();
        return;
      }

      const sessionUser = await userBySessionTokenProvider.findBySessionTokenAndUpdateLastActivity(sessionToken);
      request._apollo_auth_data = sessionUser != null ? { kind: 'session', ...sessionUser } : null;

      if (sessionUser == null) {
        sessionCookieHelper.unsetCookie(reply, false);
      }

      reply.serverTiming?.stopCurrent();
    });

    this.fastify.decorateRequest('getSessionUserOptional', function(): SessionUser | null {
      return this._apollo_auth_data?.kind === 'session' ? this._apollo_auth_data : null;
    });

    this.fastify.decorateRequest('getSessionUser', function(): SessionUser {
      const sessionUser = this.getSessionUserOptional();
      if (sessionUser == null) {
        throw new Error('No user is authenticated for this request');
      }
      return sessionUser;
    });

    this.fastify.decorateRequest('getAuthenticatedUserOptional', function(): ApolloUser | null {
      return this._apollo_auth_data?.user ?? null;
    });

    this.fastify.decorateRequest('getAuthenticatedUser', function(): ApolloUser {
      const user = this.getAuthenticatedUserOptional();
      if (user == null) {
        throw new Error('No user is authenticated for this request');
      }
      return user;
    });
  }

  private decorateRequestForCsrfValidation(csrfTokenValidator: CsrfTokenValidator): void {
    this.fastify.decorateRequest('requireCsrf', function(sentToken: string | undefined): void {
      const session = this.getSessionUserOptional()?.session;
      if (session == null || !csrfTokenValidator.validate(sentToken ?? '', session.csrfToken)) {
        throw new BadRequestError('CSRF token is invalid');
      }
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
      const allowsAccessToken = router.allowAccessTokenAccess?.() === true;

      this.fastify.register((instance, options) => {
        if (allowsAccessToken) {
          instance.addHook('preHandler', this.createAccessTokenPreHandler());
        }

        if (router.allowUnauthenticatedAccess?.() !== true) {
          instance.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
            if (req.getAuthenticatedUserOptional() == null) {
              throw this.createUnauthorizedError(reply, allowsAccessToken);
            }
          });
        }

        router.register(instance, options);
      }, { prefix: router.getRoutePrefix?.() });
    }
  }

  private createAccessTokenPreHandler(): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const authorizationHeader = request.headers.authorization;
      if (authorizationHeader == null || authorizationHeader === '') {
        return;
      }

      reply.serverTiming?.startNext('auth-token');
      const bearerToken = this.accessTokenBearerHelper.extractBearerToken(authorizationHeader);
      const accessTokenUser = bearerToken != null ? await this.accessTokenBearerHelper.findUserByBearerToken(bearerToken) : null;
      reply.serverTiming?.stopCurrent();

      // The client explicitly presented credentials, so the cookie is out of the picture even if the header is unusable
      if (accessTokenUser == null) {
        throw this.createUnauthorizedError(reply, true);
      }

      request._apollo_auth_data = { kind: 'accessToken', ...accessTokenUser };
    };
  }

  private createUnauthorizedError(reply: FastifyReply, allowsAccessToken: boolean): UnauthorizedError {
    if (allowsAccessToken) {
      reply.header('WWW-Authenticate', 'Bearer');
    }
    return new UnauthorizedError();
  }
}
