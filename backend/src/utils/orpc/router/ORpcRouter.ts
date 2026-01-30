import * as FastifyCookiePlugin from '@fastify/cookie';
import { implement, type Router } from '@orpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { container } from 'tsyringe';
import SessionCookieHelper from '../../../auth/session/SessionCookieHelper.js';
import UserBySessionTokenProvider from '../../../auth/UserBySessionTokenProvider.js';
import { oRpcContract } from '../contract/oRpcContract.js';
import AdminORpcRouterFactory from './sub-routers/admin.js';
import AuthORpcRouterFactory from './sub-routers/auth.js';
import FilesORpcRouterFactory from './sub-routers/files.js';
import MediaORpcRouterFactory from './sub-routers/media.js';
import SessionORpcRouterFactory from './sub-routers/session.js';
import TmpBackendORpcRouterFactory from './sub-routers/tmp-backend.js';
import UserORpcRouterFactory from './sub-routers/user.js';

export type ORpcInitialContext = {
  headers: IncomingHttpHeaders;
}

export type PlainORpcImplementer = typeof plainImplementer;
export type OptionallyAuthenticatedORpcImplementer = typeof baseImplementer;
export type AuthenticatedSuperUserORpcImplementer = typeof authenticatedSuperUserImplementer;
export type ORpcImplementer = typeof authenticatedImplementer;
export type SubRouter<T extends keyof typeof oRpcContract> = Router<(typeof oRpcContract)[T], ORpcInitialContext>;

const plainImplementer = implement(oRpcContract).$context<ORpcInitialContext>();

const baseImplementer = plainImplementer
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

const authenticatedImplementer = baseImplementer
  .use(async ({ context, next, errors }) => {
    if (context.sessionInfo == null) {
      throw errors.UNAUTHORIZED();
    }

    return next({
      context: {
        sessionInfo: context.sessionInfo,
      },
    });
  });

const authenticatedSuperUserImplementer = authenticatedImplementer
  .use(async ({ context, next, errors }) => {
    if (context.sessionInfo?.user.isSuperUser !== true) {
      throw errors.NO_PERMISSIONS();
    }
    return next();
  });

export const ORPC_ROUTER = plainImplementer.router({
  tmpBackend: container.resolve(TmpBackendORpcRouterFactory).create(plainImplementer),

  user: container.resolve(UserORpcRouterFactory).create(authenticatedImplementer.user),
  session: container.resolve(SessionORpcRouterFactory).create(baseImplementer),

  auth: container.resolve(AuthORpcRouterFactory).create(authenticatedImplementer.auth),

  files: container.resolve(FilesORpcRouterFactory).create(authenticatedImplementer.files),
  media: container.resolve(MediaORpcRouterFactory).create(authenticatedImplementer.media),

  admin: container.resolve(AdminORpcRouterFactory).create(authenticatedSuperUserImplementer.admin),
});
