import * as FastifyCookiePlugin from '@fastify/cookie';
import { os } from '@orpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { container } from 'tsyringe';
import AuthSessionFinder from '../../auth/session/AuthSessionFinder.js';
import SessionCookieHelper from '../../auth/session/SessionCookieHelper.js';

export type ORPCInitialContext = {
  headers: IncomingHttpHeaders
}

export const base = os
  .errors({
    UNAUTHORIZED: {},
    NOT_AVAILABLE_FOR_LOGGED_IN_USER: {},
    REQUESTED_ENTITY_NOT_FOUND: {},
  });


export const authenticated = base
  .$context<ORPCInitialContext>()
  .use(async ({ context, next }) => {
    // TODO: Throw proper Unauthorized errors
    // FIXME: This logic is pretty similar to the one in FastifyWebServer.ts – Refactor!
    const cookies = FastifyCookiePlugin.fastifyCookie.parse(context.headers.cookie || '');

    const sessionToken = container.resolve(SessionCookieHelper).extractSessionCookieValue(cookies, false);
    const sessionData = sessionToken != null
      ? await container.resolve(AuthSessionFinder).findSession(sessionToken)
      : null;

    // TODO: oRPC does not extend session lifetimes and does not unset invalid session cookies yet

    return next({
      context: {
        // FIXME: 'sessionInfo' content/structure is based on better-auth; clean up/restructure as needed
        sessionInfo: sessionData != null ? {
          session: {
            id: sessionData.id,
          },
          user: {
            id: sessionData.user.id,
            name: sessionData.user.displayName,
          },
        } : null,
      },
    });
  });
