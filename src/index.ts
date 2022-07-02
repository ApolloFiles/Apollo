import { getConfig, getProcessManager, getSqlDatabase } from './Constants';
import WebServer from './webserver/WebServer';

let webServer: WebServer | undefined;
let registeredShutdownHook: boolean = false;

index();

function index() {
  if (!registeredShutdownHook) {
    registeredShutdownHook = true;

    process.on('SIGTERM', shutdownHook);
    process.on('SIGINT', shutdownHook);
    process.on('SIGQUIT', shutdownHook);
    process.on('SIGHUP', shutdownHook);
  }

  webServer = new WebServer();

  webServer.listen(getConfig().data.webserver.port, getConfig().data.webserver.host)
      .then(() => console.log(`Server started on ${getConfig().data.webserver.host}:${getConfig().data.webserver.port} (${getConfig().data.baseUrl})`))
      .catch((err) => {
        console.error(err);

        shutdownHook();
      });
}

function shutdownHook() {
  console.log('Shutting down...');

  const postWebserver = async (): Promise<never> => {
    if (getSqlDatabase()) {
      try {
        await getSqlDatabase()?.shutdown();
      } catch (err) {
        console.error(err);
      } finally {
        console.log('Database handler has been shutdown.');
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
