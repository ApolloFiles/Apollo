import FastifyCookiePlugin from '@fastify/cookie';
import FastifyFormBodyPlugin from '@fastify/formbody';
import FastifyWebSocketPlugin from '@fastify/websocket';
import { BadRequestError, UnauthorizedError } from '@sprax/node-framework';
import {
  BaseWebServer,
  defaultHeadersPlugin,
  type FastifyInstanceWithZod,
  type Router,
  serverTimingPlugin,
} from '@sprax/node-framework/web';
import type { FastifyHttpOptions, FastifyReply, FastifyRequest } from 'fastify';
import Http from 'node:http';
import { singleton } from 'tsyringe';
import AccessTokenBearerHelper from '../../auth/access_token/AccessTokenBearerHelper.js';
import type { AccessTokenUser } from '../../auth/access_token/UserByAccessTokenProvider.js';
import CsrfTokenValidator from '../../auth/CsrfTokenValidator.js';
import SessionCookieHelper from '../../auth/session/SessionCookieHelper.js';
import UserBySessionTokenProvider, { type SessionUser } from '../../auth/UserBySessionTokenProvider.js';
import { IS_PRODUCTION } from '../../constants.js';
import type ApolloUser from '../../user/ApolloUser.js';
import { isApolloRouter } from './ApolloRouter.js';
import FrontendRequestHandlerFactory from './FrontendRequestHandlerFactory.js';
import InitialRequestRouter from './InitialRequestRouter.js';
import ORPCRequestHandler from './ORPCRequestHandler.js';

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

@singleton()
export default class ApolloWebServer extends BaseWebServer {
  constructor(
    private readonly oRPCRequestHandler: ORPCRequestHandler,
    private readonly sessionCookieHelper: SessionCookieHelper,
    private readonly userBySessionTokenProvider: UserBySessionTokenProvider,
    private readonly csrfTokenValidator: CsrfTokenValidator,
    private readonly accessTokenBearerHelper: AccessTokenBearerHelper,
  ) {
    super();
  }

  protected override configureFastify(defaults: FastifyHttpOptions<Http.Server>): FastifyHttpOptions<Http.Server> {
    return {
      ...defaults,
      routerOptions: {
        ...defaults.routerOptions,
        maxParamLength: 255,
      },

      trustProxy: false, // FIXME

      // TODO: Evaluate potential alternatives and performance implications (of using serverFactory for oRPC)
      serverFactory: (fastifyHandler) => {
        const initialRequestRouter = new InitialRequestRouter(this.oRPCRequestHandler, fastifyHandler, new FrontendRequestHandlerFactory().create());
        return Http.createServer((req, res): Promise<void> => {
          return initialRequestRouter.route(req, res);
        });
      },
    };
  }

  protected override registerPlugins(server: FastifyInstanceWithZod): void {
    server.register(serverTimingPlugin, {
      shouldSendHeader: (request) => !IS_PRODUCTION || request.getAuthenticatedUserOptional()?.hasSuperUserPrivileges === true,
    });

    server.register(FastifyCookiePlugin);
    this.decorateRequestForAuthentication(server);
    this.decorateRequestForCsrfValidation(server);

    server.register(FastifyFormBodyPlugin, { bodyLimit: 1024 * 1024 /* 1 MiB */ });
    server.register(FastifyWebSocketPlugin);

    server.register(defaultHeadersPlugin);
  }

  protected override configureRouterScope(scope: FastifyInstanceWithZod, router: Router): void {
    if (!isApolloRouter(router)) {
      throw new Error(`${router.constructor.name} does not implement ApolloRouter: its access flags must be methods`);
    }

    const allowsAccessToken = router.allowAccessTokenAccess?.() === true;

    if (allowsAccessToken) {
      scope.addHook('preHandler', this.createAccessTokenPreHandler());
    }

    if (router.allowUnauthenticatedAccess?.() !== true) {
      scope.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (req.getAuthenticatedUserOptional() == null) {
          throw this.createUnauthorizedError(reply, allowsAccessToken);
        }
      });
    }
  }

  private decorateRequestForAuthentication(server: FastifyInstanceWithZod): void {
    server.decorateRequest('_apollo_auth_data', null);

    server.addHook('preHandler', async (request, reply): Promise<void> => {
      reply.serverTiming?.startNext('auth');

      const sessionToken = this.sessionCookieHelper.extractSessionCookieValue(request.cookies, false);
      if (sessionToken == null) {
        request._apollo_auth_data = null;

        reply.serverTiming?.stopCurrent();
        return;
      }

      const sessionUser = await this.userBySessionTokenProvider.findBySessionTokenAndUpdateLastActivity(sessionToken);
      request._apollo_auth_data = sessionUser != null ? { kind: 'session', ...sessionUser } : null;

      if (sessionUser == null) {
        this.sessionCookieHelper.unsetCookie(reply, false);
      }

      reply.serverTiming?.stopCurrent();
    });

    server.decorateRequest('getSessionUserOptional', function(): SessionUser | null {
      return this._apollo_auth_data?.kind === 'session' ? this._apollo_auth_data : null;
    });

    server.decorateRequest('getSessionUser', function(): SessionUser {
      const sessionUser = this.getSessionUserOptional();
      if (sessionUser == null) {
        throw new Error('No user is authenticated for this request');
      }
      return sessionUser;
    });

    server.decorateRequest('getAuthenticatedUserOptional', function(): ApolloUser | null {
      return this._apollo_auth_data?.user ?? null;
    });

    server.decorateRequest('getAuthenticatedUser', function(): ApolloUser {
      const user = this.getAuthenticatedUserOptional();
      if (user == null) {
        throw new Error('No user is authenticated for this request');
      }
      return user;
    });
  }

  private decorateRequestForCsrfValidation(server: FastifyInstanceWithZod): void {
    const csrfTokenValidator = this.csrfTokenValidator;
    server.decorateRequest('requireCsrf', function(sentToken: string | undefined): void {
      const session = this.getSessionUserOptional()?.session;
      if (session == null || !csrfTokenValidator.validate(sentToken ?? '', session.csrfToken)) {
        throw new BadRequestError('CSRF token is invalid');
      }
    });
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
