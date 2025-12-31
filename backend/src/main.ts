import './sentry-init.js';
import './container-init.js';
import { container } from 'tsyringe';
import type App from './boot/App.js';
import WebApp from './boot/WebApp.js';
import { IS_PRODUCTION } from './constants.js';
import DatabaseClient from './database/DatabaseClient.js';
import FullLibraryIndexingHelper from './plugins/official/media/library/FullLibraryIndexingHelper.js';
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

  // TODO: Move to a scheduled job system (and have different intervals for anonymous vs. authenticated sessions)
  setInterval(async () => {
    const databaseClient = container.resolve(DatabaseClient);
    const now = await databaseClient.fetchNow();

    const sessionCleanUpResult = await Promise.all([
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
    ]);

    if (sessionCleanUpResult[0].count > 0) {
      console.debug('Cleaned up', sessionCleanUpResult[0].count, 'expired anonymous sessions');
    }
    if (sessionCleanUpResult[1].count > 0) {
      console.debug('Cleaned up', sessionCleanUpResult[1].count, 'expired auth sessions');
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
