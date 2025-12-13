import './sentry-init.js';
import './container-init.js';
import { container } from 'tsyringe';
import type App from './boot/App.js';
import WebApp from './boot/WebApp.js';
import { IS_PRODUCTION } from './constants.js';
import MediaLibraryFinder from './plugins/official/media/library/database/finder/MediaLibraryFinder.js';
import MediaLibraryScanner from './plugins/official/media/library/scanner/MediaLibraryScanner.js';
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
  (async () => {
    const mediaLibraryFinder = container.resolve(MediaLibraryFinder);
    const mediaLibraryScanner = container.resolve(MediaLibraryScanner);

    const users = await container.resolve(UserProvider).findAll();
    for (const user of users) {
      const libraries = await mediaLibraryFinder.findOwnedByUser(user);

      for (const library of libraries) {
        try {
          await mediaLibraryScanner.scan(library);
          console.log(`Done scanning library ${library.name} (id: ${library.id}, owner: ${user.displayName})`);
        } catch (err) {
          console.error(err);
        }
      }
    }
  })().catch(console.error);
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
