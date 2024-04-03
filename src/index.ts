import Fs from 'node:fs';
import {
  getAppTmpDir,
  getConfig,
  getPrismaClientIfAlreadyInitialized,
  getProcessManager,
  getUserStorageTmpRootOnSameFileSystem
} from './Constants';
import LibraryManager from './media/libraries/LibraryManager';
import LibraryScanner from './media/libraries/scan/LibraryScanner';
import UserStorage from './UserStorage';
import WebServer from './webserver/WebServer';

let webServer: WebServer | undefined;
let registeredShutdownHook: boolean = false;

index();

function index(): void {
  if (!registeredShutdownHook) {
    registeredShutdownHook = true;

    process.on('SIGTERM', shutdownHook);
    process.on('SIGINT', shutdownHook);
    process.on('SIGQUIT', shutdownHook);
    process.on('SIGHUP', shutdownHook);
  }

  Fs.rmSync(getAppTmpDir(), { recursive: true, force: true });
  Fs.mkdirSync(getAppTmpDir(), { recursive: true });

  Fs.rmSync(getUserStorageTmpRootOnSameFileSystem(), { recursive: true, force: true });

  new UserStorage().getUser(1)
    .then((user) => {
      return new LibraryManager(user!).getLibraries()
        .then((libraries) => {
          for (const library of libraries) {
            new LibraryScanner().scanLibrary(library)
              .then(() => console.log(`Done scanning library ${library.name} (id: ${library.id})`))
              .catch(console.error);
          }
        });
    })
    .catch(console.error);

  webServer = new WebServer();

  webServer.listen(getConfig().data.webserver.port, getConfig().data.webserver.host)
    .then(() => console.log(`Server started on ${getConfig().data.webserver.host}:${getConfig().data.webserver.port} (${getConfig().data.baseUrl})`))
    .catch((err) => {
      console.error(err);

      shutdownHook();
    });
}

function shutdownHook(): void {
  console.log('Shutting down...');

  const postWebserver = async (): Promise<never> => {
    const prismaClient = getPrismaClientIfAlreadyInitialized();
    if (prismaClient != null) {
      try {
        await prismaClient.$disconnect();
      } catch (err) {
        console.error(err);
      } finally {
        console.log('Disconnected from the database.');
      }
    }

    try {
      await getProcessManager().shutdown();
    } catch (err) {
      console.error(err);
    } finally {
      console.log('ProcessManager shut down.');
    }

    process.exit();
  };

  if (webServer) {
    webServer.shutdown()
      .then(() => console.log('WebServer shut down.'))
      .catch(console.error)
      .finally(() => {
        postWebserver()
          .catch(console.error);
      });

    webServer = undefined;
  } else {
    postWebserver()
      .catch(console.error);
  }
}
