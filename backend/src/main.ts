import './sentry-init.js';
import './container-init.js';
import { container } from 'tsyringe';
import AccountCreationInviteCreator from './auth/account_creation_invite/AccountCreationInviteCreator.js';
import type App from './boot/App.js';
import WebApp from './boot/WebApp.js';
import AppConfiguration from './config/AppConfiguration.js';
import { IS_PRODUCTION } from './constants.js';
import DatabaseClient from './database/DatabaseClient.js';
import FullLibraryIndexingHelper from './plugins/official/media/library/FullLibraryIndexingHelper.js';
import UserProvider from './user/UserProvider.js';
import SentrySdk from './utils/SentrySdk.js';

// main

let app: App | undefined;
await bootstrap();

// functions

async function bootstrap(): Promise<void> {
  registerShutdownHooks();

  if (!IS_PRODUCTION) {
    console.log('RUNNING IN DEVELOPMENT MODE');
  }
  console.log();

  app = new WebApp();
  await app.boot();

  // TODO: remove debug
  container.resolve(FullLibraryIndexingHelper).runForAllUsers().catch(console.error);

  // TODO: Move this out of the main-file
  setImmediate(async () => {
    const userProvider = container.resolve(UserProvider);

    if (!(await userProvider.atLeastOneAccountExists())) {
      const accountCreationInviteCreator = container.resolve(AccountCreationInviteCreator);
      const appConfig = container.resolve(AppConfiguration);

      const inviteToken = await accountCreationInviteCreator.createForSuperUserAccount();
      console.info([
        '',
        '--=== No user account yet ===--',
        `Create your admin account at: ${appConfig.config.baseUrl}/create-account?invite=${inviteToken}`,
        'The link will be valid for 10 minutes',
        '',
      ].join('\n'));
    }
  });

  // TODO: Move to a scheduled job system (and have different intervals for anonymous vs. authenticated sessions)
  setInterval(async () => {
    const databaseClient = container.resolve(DatabaseClient);
    const now = await databaseClient.fetchNow();

    // I use a transaction here, to only take-up one 'connection',
    // but I would prefer one failed delete not to roll back the other deletes
    const sessionCleanUpResult = await databaseClient.$transaction([
      databaseClient.authAnonymousSession.deleteMany({
        where: {
          expiresAt: { lte: now },
        },
      }),
      databaseClient.authSession.deleteMany({
        where: {
          expiresAt: { lte: now },
        },
      }),
      databaseClient.authAccountCreationInviteToken.deleteMany({
        where: {
          expiresAt: { lte: now },
        },
      }),
    ]);

    if (sessionCleanUpResult[0].count > 0) {
      console.debug('Cleaned up', sessionCleanUpResult[0].count, 'expired anonymous sessions');
    }
    if (sessionCleanUpResult[1].count > 0) {
      console.debug('Cleaned up', sessionCleanUpResult[1].count, 'expired auth sessions');
    }
    if (sessionCleanUpResult[2].count > 0) {
      console.debug('Cleaned up', sessionCleanUpResult[2].count, 'expired account creation invites');
    }
  }, 5 * 60 * 1000);
}

function registerShutdownHooks(): void {
  let shutdownInProgress = false;
  const handleShutdown = async () => {
    if (shutdownInProgress) {
      console.warn('Received second shutdown signal – Forcing shutdown');
      process.exit(90);
    }

    shutdownInProgress = true;
    console.log('Shutting down...');

    await app?.shutdown();
    await container.dispose();

    await SentrySdk.shutdown();

    console.log('Finished graceful shutdown.');
    process.exit();
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('SIGQUIT', handleShutdown);
  process.on('SIGHUP', handleShutdown);
}
