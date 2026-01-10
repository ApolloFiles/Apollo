import * as FastifyCookiePlugin from '@fastify/cookie';
import { os } from '@orpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { container } from 'tsyringe';
import SessionCookieHelper from '../../auth/session/SessionCookieHelper.js';
import UserBySessionTokenProvider from '../../auth/UserBySessionTokenProvider.js';

export type ORPCInitialContext = {
  headers: IncomingHttpHeaders
}

export const base = os
  .errors({
    UNAUTHORIZED: {},
    NO_PERMISSIONS: {},
    INVALID_INPUT: {},
    NOT_AVAILABLE_FOR_LOGGED_IN_USER: {},
    REQUESTED_ENTITY_NOT_FOUND: {},
    UNSUPPORTED_FILE: {},
  });

export const authenticated = base
  .$context<ORPCInitialContext>()
  .use(async ({ context, next }) => {
    // TODO: Throw proper Unauthorized errors
    // FIXME: This logic is pretty similar to the one in FastifyWebServer.ts – Refactor!
    const cookies = FastifyCookiePlugin.fastifyCookie.parse(context.headers.cookie || '');

    const sessionToken = container.resolve(SessionCookieHelper).extractSessionCookieValue(cookies, false);
    const sessionData = sessionToken != null
      ? await container.resolve(UserBySessionTokenProvider).findBySessionTokenAndUpdateLastActivity(sessionToken)
      : null;

    // TODO: oRPC does not extend session lifetimes and does not unset invalid session cookies yet

    return next({
      context: {
        // FIXME: 'sessionInfo' content/structure is based on better-auth; clean up/restructure as needed
        sessionInfo: sessionData != null ? {
          session: {
            id: sessionData.session.id,
          },
          user: {
            id: sessionData.user.id,
            name: sessionData.user.displayName,
            isSuperUser: sessionData.user.isSuperUser,
          },
        } : null,
      },
    });
  });

export const authenticatedAdmin = authenticated
  .use(async ({ context, next, errors }) => {
    if (context.sessionInfo == null) {
      throw errors.UNAUTHORIZED();
    }
    if (context.sessionInfo.user.isSuperUser !== true) {
      throw errors.NO_PERMISSIONS();
    }

    return next();
  });
