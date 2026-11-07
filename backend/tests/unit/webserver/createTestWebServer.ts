import type { FastifyInstanceWithZod, Router } from '@sprax/node-framework/web';
import type AccessTokenBearerHelper from '#src/auth/access_token/AccessTokenBearerHelper.js';
import type { AccessTokenUser } from '#src/auth/access_token/UserByAccessTokenProvider.js';
import type CsrfTokenValidator from '#src/auth/CsrfTokenValidator.js';
import type SessionCookieHelper from '#src/auth/session/SessionCookieHelper.js';
import type { default as UserBySessionTokenProvider, SessionUser } from '#src/auth/UserBySessionTokenProvider.js';
import type AppConfiguration from '#src/config/AppConfiguration.js';
import ApolloUser from '#src/user/ApolloUser.js';
import type ApolloRouter from '#src/webserver/server/ApolloRouter.js';
import ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import type ORPCRequestHandler from '#src/webserver/server/ORPCRequestHandler.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

export const TEST_USER = new ApolloUser('u_alice_3fK9xQ2mL8pR7wZ', 'Alice', false, false, null);
export const TEST_ACCESS_TOKEN = 'apollo_pat_valid';
export const TEST_SESSION_COOKIE = 'test_session';
export const TEST_SESSION_TOKEN = 'valid';

export type TestCredentials = {
  /** Authenticated by `Bearer ${TEST_ACCESS_TOKEN}` */
  tokenUser?: ApolloUser;
  /** Authenticated by the cookie `${TEST_SESSION_COOKIE}=${TEST_SESSION_TOKEN}` */
  sessionUser?: ApolloUser;
};

/** A router mounted under the prefix its directory would derive in production, e.g. `/media/:mediaId` */
export type PrefixedRouter = { router: ApolloRouter, prefix: string };

/** An {@link ApolloWebServer} with mocked authentication that mounts `routers` without a prefix unless one is given */
export function createTestWebServer(routers: (Router | PrefixedRouter)[], credentials: TestCredentials = { tokenUser: TEST_USER }): ApolloWebServer {
  return new TestApolloWebServer(routers, credentials);
}

export async function getWithAccessToken(server: ApolloWebServer, url: string): Promise<{ statusCode: number, body: any }> {
  const response = await server.inject({ url, headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` } });
  return { statusCode: response.statusCode, body: response.json() };
}

class TestApolloWebServer extends ApolloWebServer {
  constructor(private readonly testRouters: (Router | PrefixedRouter)[], credentials: TestCredentials) {
    const sessionCookieHelper = createStrictDeepMock<SessionCookieHelper>();
    sessionCookieHelper.extractSessionCookieValue.mockImplementation((cookies) => cookies[TEST_SESSION_COOKIE]);
    sessionCookieHelper.unsetCookie.mockReturnValue(undefined);

    const userBySessionTokenProvider = createStrictDeepMock<UserBySessionTokenProvider>();
    userBySessionTokenProvider.findBySessionTokenAndUpdateLastActivity.mockImplementation(async (token) => {
      const user = token === TEST_SESSION_TOKEN ? credentials.sessionUser : undefined;
      return user != null ? { user, session: {} } as unknown as SessionUser : null;
    });

    const accessTokenBearerHelper = createStrictDeepMock<AccessTokenBearerHelper>();
    accessTokenBearerHelper.extractBearerToken.mockImplementation((header) => header.startsWith('Bearer ') ? header.substring('Bearer '.length) : null);
    accessTokenBearerHelper.findUserByBearerToken.mockImplementation(async (token) => {
      const user = token === TEST_ACCESS_TOKEN ? credentials.tokenUser : undefined;
      return user != null ? { user, accessToken: {} } as unknown as AccessTokenUser : null;
    });

    super(
      createStrictDeepMock<ORPCRequestHandler>(),
      sessionCookieHelper,
      userBySessionTokenProvider,
      createStrictDeepMock<CsrfTokenValidator>(),
      accessTokenBearerHelper,
      createStrictDeepMock<AppConfiguration>({ config: { baseUrl: 'https://apollo.example.com' } }),
    );
  }

  protected override resolveRouters(): Router[] {
    return this.testRouters.map((entry) => 'prefix' in entry ? new PrefixedRouterAdapter(entry.router, entry.prefix) : entry);
  }
}

/** Mounts a router in a prefixed scope, keeping its access flags on the outer scope where the server reads them */
class PrefixedRouterAdapter implements ApolloRouter {
  constructor(
    private readonly router: ApolloRouter,
    private readonly prefix: string,
  ) {
  }

  allowUnauthenticatedAccess(): boolean {
    return this.router.allowUnauthenticatedAccess?.() === true;
  }

  allowAccessTokenAccess(): boolean {
    return this.router.allowAccessTokenAccess?.() === true;
  }

  async register(server: FastifyInstanceWithZod): Promise<void> {
    await server.register(async (scope) => this.router.register(scope), { prefix: this.prefix });
  }
}
