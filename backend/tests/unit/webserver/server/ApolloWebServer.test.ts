import type { FastifyInstanceWithZod, Router } from '@sprax/node-framework/web';
import ApolloUser from '#src/user/ApolloUser.js';
import type ApolloRouter from '#src/webserver/server/ApolloRouter.js';
import ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import {
  createTestWebServer,
  TEST_ACCESS_TOKEN,
  TEST_SESSION_COOKIE,
  TEST_SESSION_TOKEN,
} from '#tests/unit/webserver/createTestWebServer.js';

const SESSION_USER = new ApolloUser('session-user', 'Session User', false, false, null);
const TOKEN_USER = new ApolloUser('token-user', 'Token User', false, false, null);
const VALID_SESSION = { [TEST_SESSION_COOKIE]: TEST_SESSION_TOKEN };

function createRouter(url: string, flags: Omit<ApolloRouter, 'register'> = {}): ApolloRouter {
  return {
    ...flags,
    register(server: FastifyInstanceWithZod): void {
      server.get(url, (request) => ({ userId: request.getAuthenticatedUserOptional()?.id ?? null }));
    },
  };
}

describe(ApolloWebServer, () => {
  let server: ApolloWebServer | undefined;

  function createServer(...routers: Router[]): ApolloWebServer {
    server = createTestWebServer(routers, { sessionUser: SESSION_USER, tokenUser: TOKEN_USER });
    return server;
  }

  afterEach(async () => {
    await server?.shutdown();
    server = undefined;
  });

  describe('for routers without access flags', () => {
    test('Rejects a request without a session', async () => {
      const response = await createServer(createRouter('/private')).inject('/private');

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeUndefined();
    });

    test('Rejects a request with an unknown session', async () => {
      const response = await createServer(createRouter('/private')).inject({ url: '/private', cookies: { [TEST_SESSION_COOKIE]: 'invalid' } });

      expect(response.statusCode).toBe(401);
    });

    test('Accepts a request with a valid session', async () => {
      const response = await createServer(createRouter('/private')).inject({ url: '/private', cookies: VALID_SESSION });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId: 'session-user' });
    });

    test('Rejects a request with only a valid bearer token', async () => {
      const response = await createServer(createRouter('/private')).inject({ url: '/private', headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` } });

      expect(response.statusCode).toBe(401);
    });
  });

  test('Accepts a request without a session for a router allowing unauthenticated access', async () => {
    const response = await createServer(createRouter('/public', { allowUnauthenticatedAccess: () => true })).inject('/public');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: null });
  });

  describe('for routers allowing access token access', () => {
    const tokenRouter = (): ApolloRouter => createRouter('/token', { allowAccessTokenAccess: () => true });

    test('Accepts a valid bearer token', async () => {
      const response = await createServer(tokenRouter()).inject({ url: '/token', headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` } });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId: 'token-user' });
    });

    test('Rejects an invalid bearer token even with a valid session', async () => {
      const response = await createServer(tokenRouter()).inject({
        url: '/token',
        headers: { authorization: 'Bearer invalid-token' },
        cookies: VALID_SESSION,
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    test('Rejects a request without any credentials and asks for a bearer token', async () => {
      const response = await createServer(tokenRouter()).inject('/token');

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    test('Accepts a valid session', async () => {
      const response = await createServer(tokenRouter()).inject({ url: '/token', cookies: VALID_SESSION });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId: 'session-user' });
    });
  });

  describe('with the framework defaults', () => {
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

  test('Refuses to start with a router whose access flag is not a method', async () => {
    const router: Router = Object.assign(createRouter('/public'), { allowUnauthenticatedAccess: true });

    await expect(createServer(router).inject('/public')).rejects.toThrow('does not implement ApolloRouter');
  });
});
