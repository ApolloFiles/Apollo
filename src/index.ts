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

  webServer.listen(8080)
      .then(() => console.log(`Server started on http://localhost:8080`))
      .catch((err) => {
        console.error(err);

        shutdownHook();
      });
}

function shutdownHook() {
  console.log('Shutting down...');

  const postWebserver = async (): Promise<never> => {
    // if (database) {
    //   try {
    //     await database.shutdown();
    //   } catch (err) {
    //     console.error(err);
    //   } finally {
    //     console.log('Database handler has been shutdown.');
    //   }
    // }

    // try {
    //   await processManager.shutdown();
    // } catch (err) {
    //   console.error(err);
    // } finally {
    //   console.log('ProcessManager shut down.');
    // }

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
