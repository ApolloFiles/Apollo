import { onError, ORPCError } from '@orpc/server';
import { container } from 'tsyringe';
import { z } from 'zod';
import AppConfiguration from '../../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../../constants.js';
import FileSystemProvider from '../../files/FileSystemProvider.js';
import UserProvider from '../../user/UserProvider.js';
import { auth } from '../auth.js';
import * as oRpcBuilder from './oRpcRouteBuilder.js';
import type { BackendConfig, FullUserProfile, VirtualFileSystemFileList } from './RouteTypes.js';

const tmpBackendConfig = oRpcBuilder
  .base
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (): Promise<BackendConfig> => {
    const appConfig = container.resolve(AppConfiguration);

    return {
      appBaseUrl: appConfig.config.baseUrl,
      internalBackendBaseUrl: IS_PRODUCTION ? appConfig.config.baseUrl : 'http://localhost:8081',
      auth: {
        providers: Object.keys(auth.options.socialProviders),
      },
    };
  });

const logoutCurrentSession = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<{ success: boolean, message?: string }> => {
    if (opts.context.sessionInfo == null) {
      return { success: false, message: 'No active session' };
    }

    await auth.api.signOut({ headers: opts.context.authHeaders });
    return { success: true };
  });

const getSessionUser = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler((opts) => {
    if (opts.context.sessionInfo == null) {
      return null;
    }

    return {
      user: opts.context.sessionInfo.user,
    };
  });

const getFullUserProfile = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<FullUserProfile> => {
    const appConfig = container.resolve(AppConfiguration);

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
      appBaseUrl: appConfig.config.baseUrl,

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

const listFilesInOwnVirtualFileSystem = oRpcBuilder
  .authenticated
  .input(z.object({ fileSystemId: z.string(), path: z.string() }))
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<VirtualFileSystemFileList> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const userProvider = container.resolve(UserProvider);
    const fileSystemProvider = container.resolve(FileSystemProvider);

    const apolloUser = await userProvider.provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const allFileSystems = await fileSystemProvider.provideForUser(apolloUser);
    const fileSystem = opts.input.fileSystemId === '_' ? allFileSystems.user[0] : [allFileSystems.trashBin, ...allFileSystems.user].find((fs) => fs.id === opts.input.fileSystemId);
    if (fileSystem == null) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const requestedFile = await fileSystem.getFile(opts.input.path);
    if (!(await requestedFile.exists())) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    if (!(await requestedFile.isDirectory())) {
      // TODO: Proper error handling
      console.debug('Requested path is not a directory');
      throw new Error('Requested path is not a directory');
    }

    const result: VirtualFileSystemFileList = {
      files: [],
    };

    for (const fileListElement of (await requestedFile.getFiles())) {
      result.files.push({
        name: fileListElement.getFileName(),
        isDirectory: await fileListElement.isDirectory(),
        path: fileListElement.path,
      });
    }

    return result;
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

  files: {
    browse: {
      listFilesInVirtualFileSystem: listFilesInOwnVirtualFileSystem,
    },
  },
};
