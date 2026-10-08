import type { FastifyInstanceWithZod, Router } from '@sprax/node-framework/web';
import type AccessTokenBearerHelper from '../../../../src/auth/access_token/AccessTokenBearerHelper.js';
import type { AccessTokenUser } from '../../../../src/auth/access_token/UserByAccessTokenProvider.js';
import type CsrfTokenValidator from '../../../../src/auth/CsrfTokenValidator.js';
import type SessionCookieHelper from '../../../../src/auth/session/SessionCookieHelper.js';
import type { default as UserBySessionTokenProvider, SessionUser } from '../../../../src/auth/UserBySessionTokenProvider.js';
import type ApolloRouter from '../../../../src/webserver/server/ApolloRouter.js';
import ApolloWebServer from '../../../../src/webserver/server/ApolloWebServer.js';
import type ORPCRequestHandler from '../../../../src/webserver/server/ORPCRequestHandler.js';
import { createStrictDeepMock } from '../../../test-helpers.js';

const SESSION_USER = { user: { id: 'session-user' }, session: {} } as unknown as SessionUser;
const TOKEN_USER = { user: { id: 'token-user' }, accessToken: {} } as unknown as AccessTokenUser;

class TestApolloWebServer extends ApolloWebServer {
  constructor(private readonly testRouters: Router[]) {
    const sessionCookieHelper = createStrictDeepMock<SessionCookieHelper>();
    sessionCookieHelper.extractSessionCookieValue.mockImplementation((cookies) => cookies['test_session']);
    sessionCookieHelper.unsetCookie.mockReturnValue(undefined);

    const userBySessionTokenProvider = createStrictDeepMock<UserBySessionTokenProvider>();
    userBySessionTokenProvider.findBySessionTokenAndUpdateLastActivity.mockImplementation(async (token) => token === 'valid' ? SESSION_USER : null);

    const accessTokenBearerHelper = createStrictDeepMock<AccessTokenBearerHelper>();
    accessTokenBearerHelper.extractBearerToken.mockImplementation((header) => header.startsWith('Bearer ') ? header.substring('Bearer '.length) : null);
    accessTokenBearerHelper.findUserByBearerToken.mockImplementation(async (token) => token === 'valid-token' ? TOKEN_USER : null);

    super(
      createStrictDeepMock<ORPCRequestHandler>(),
      sessionCookieHelper,
      userBySessionTokenProvider,
      createStrictDeepMock<CsrfTokenValidator>(),
      accessTokenBearerHelper,
    );
  }

  protected override resolveRouters(): Router[] {
    return this.testRouters;
  }
}

function createRouter(url: string, flags: Omit<ApolloRouter, 'register'> = {}): ApolloRouter {
  return {
    ...flags,
    register(server: FastifyInstanceWithZod): void {
      server.get(url, (request) => ({ userId: request.getAuthenticatedUserOptional()?.id ?? null }));
    },
  };
}

let server: TestApolloWebServer | undefined;

function createServer(...routers: Router[]): TestApolloWebServer {
  server = new TestApolloWebServer(routers);
  return server;
}

afterEach(async () => {
  await server?.shutdown();
  server = undefined;
});

describe('Routers without flags', () => {
  test('Rejects a request without a session', async () => {
    const response = await createServer(createRouter('/private')).inject('/private');

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBeUndefined();
  });

  test('Rejects a request with an unknown session', async () => {
    const response = await createServer(createRouter('/private')).inject({ url: '/private', cookies: { test_session: 'invalid' } });

    expect(response.statusCode).toBe(401);
  });

  test('Accepts a request with a valid session', async () => {
    const response = await createServer(createRouter('/private')).inject({ url: '/private', cookies: { test_session: 'valid' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: 'session-user' });
  });

  test('Ignores a valid bearer token', async () => {
    const response = await createServer(createRouter('/private')).inject({ url: '/private', headers: { authorization: 'Bearer valid-token' } });

    expect(response.statusCode).toBe(401);
  });
});

describe('Routers allowing unauthenticated access', () => {
  test('Accepts a request without a session', async () => {
    const response = await createServer(createRouter('/public', { allowUnauthenticatedAccess: () => true })).inject('/public');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: null });
  });
});

describe('Routers allowing access token access', () => {
  const tokenRouter = (): ApolloRouter => createRouter('/token', { allowAccessTokenAccess: () => true });

  test('Accepts a valid bearer token', async () => {
    const response = await createServer(tokenRouter()).inject({ url: '/token', headers: { authorization: 'Bearer valid-token' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: 'token-user' });
  });

  test('Rejects an invalid bearer token even with a valid session', async () => {
    const response = await createServer(tokenRouter()).inject({
      url: '/token',
      headers: { authorization: 'Bearer invalid-token' },
      cookies: { test_session: 'valid' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  test('Rejects a request without any credentials and asks for a bearer token', async () => {
    const response = await createServer(tokenRouter()).inject('/token');

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  test('Still accepts a valid session', async () => {
    const response = await createServer(tokenRouter()).inject({ url: '/token', cookies: { test_session: 'valid' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: 'session-user' });
  });
});

describe('Framework defaults', () => {
  test('Responds 404 to an unknown path', async () => {
    const response = await createServer(createRouter('/private')).inject('/unknown');

    expect(response.statusCode).toBe(404);
  });

  test('Responds 405 with an Allow header to a known path with the wrong method', async () => {
    const response = await createServer(createRouter('/private')).inject({ method: 'DELETE', url: '/private' });

    expect(response.statusCode).toBe(405);
    expect(response.headers['allow']).toBe('HEAD, GET');
  });

  test('Sends the default security headers', async () => {
    const response = await createServer(createRouter('/public', { allowUnauthenticatedAccess: () => true })).inject('/public');

    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain(`default-src 'none'`);
  });
});

describe('Router validation', () => {
  test('Refuses to start with a router whose access flag is not a method', async () => {
    const router: Router = Object.assign(createRouter('/public'), { allowUnauthenticatedAccess: true });

    await expect(createServer(router).inject('/public')).rejects.toThrow('does not implement ApolloRouter');
  });
});
