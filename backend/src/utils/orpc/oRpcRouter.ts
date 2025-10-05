import { auth } from '../auth.js';
import * as oRpcBuilder from './oRpcRouteBuilder.js';
import type { BackendConfig, FullUserProfile } from './RouteTypes.js';

const tmpBackendConfig = oRpcBuilder
  .base
  .handler(async (): Promise<BackendConfig> => {
    return {
      appBaseUrl: 'http://localhost:5177',
      internalBackendBaseUrl: 'http://localhost:8081',
      auth: {
        providers: Object.keys(auth.options.socialProviders),
      },
    };
  });

const logoutCurrentSession = oRpcBuilder
  .authenticated
  .handler(async (opts): Promise<{ success: boolean, message?: string }> => {
    if (opts.context.sessionInfo == null) {
      return { success: false, message: 'No active session' };
    }

    await auth.api.signOut({ headers: opts.context.authHeaders });
    return { success: true };
  });

const getSessionUser = oRpcBuilder
  .authenticated
  .handler((opts) => {
    if (opts.context.sessionInfo == null) {
      return null;
    }

    return {
      user: opts.context.sessionInfo.user,
      //      sessionToken: opts.context.sessionInfo.session.token,
    };
  });

const getFullUserProfile = oRpcBuilder
  .authenticated
  .handler(async (opts): Promise<FullUserProfile> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const accounts = await auth.api.listUserAccounts({ headers: opts.context.authHeaders });
    const sessions = (await auth.api.listSessions({ headers: opts.context.authHeaders }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      user: {
        id: sessionInfo.user.id,
        name: sessionInfo.user.name,
        email: sessionInfo.user.email,
        createdAt: sessionInfo.user.createdAt,
      },

      linkedAccounts: accounts.map((account) => {
        return {
          id: account.id,
          providerId: account.providerId,
          accountId: account.accountId,
          createdAt: account.createdAt,
        };
      }),
      availableAccountProviders: Object.keys(auth.options.socialProviders),
      appBaseUrl: 'http://localhost:5177',  // FIXME

      session: {
        current: sessionInfo.session.id,
        all: sessions.map((session) => {
          return {
            id: session.id,
            token: session.token,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            userAgent: session.userAgent ?? null,
            ipAddress: session.ipAddress ?? null,
          };
        }),
      },
    };
  });

export const oRpcRouter = {
  tmpBackend: {
    getConfig: tmpBackendConfig,
  },

  session: {
    get: getSessionUser,
    getFullProfile: getFullUserProfile,
    logoutCurrent: logoutCurrentSession,
  },
};
