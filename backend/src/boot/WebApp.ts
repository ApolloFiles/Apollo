import { container } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../constants.js';
import DatabaseClient from '../database/DatabaseClient.js';
import StartupCleaner from '../files/StartupCleaner.js';
import FastifyWebServer from '../webserver/server/FastifyWebServer.js';
import type App from './App.js';

export default class WebApp implements App {
  private webServer: FastifyWebServer | undefined;

  async boot(): Promise<void> {
    if (IS_PRODUCTION) {
      await container.resolve(DatabaseClient).runDatabaseMigrations();
    }

    await container.resolve(StartupCleaner).cleanUp();

    const appConfig = container.resolve(AppConfiguration);
    this.exposeInternalBackendUrlForFrontendSsr(appConfig);
    this.webServer = container.resolve(FastifyWebServer);

    await this.webServer.listen(appConfig.config.serverInterface, appConfig.config.serverPort);

    this.printReadyMessage(appConfig);
  }

  private exposeInternalBackendUrlForFrontendSsr(appConfig: AppConfiguration): void {
    if (process.env.APOLLO_INTERNAL_BACKEND_URL != null && process.env.APOLLO_INTERNAL_BACKEND_URL !== '') {
      return;
    }

    const backendInterface = appConfig.config.serverInterface;
    let loopbackHost: string;
    if (backendInterface === '' || backendInterface === '0.0.0.0') {
      loopbackHost = '127.0.0.1';
    } else if (backendInterface === '::' || backendInterface === '::0') {
      loopbackHost = '[::1]';
    } else {
      // A specific bind address – reach it directly (wrap IPv6 literals in brackets for the URL)
      loopbackHost = backendInterface.includes(':') ? `[${backendInterface}]` : backendInterface;
    }

    process.env.APOLLO_INTERNAL_BACKEND_URL = `http://${loopbackHost}:${appConfig.config.serverPort}`;
  }

  async shutdown(): Promise<void> {
    await this.webServer?.shutdown();
    this.webServer = undefined;
  }

  private printReadyMessage(appConfig: AppConfiguration): void {
    let suffix = ` on port ${appConfig.config.serverPort}`;
    if (!IS_PRODUCTION) {
      suffix = ` (http://127.0.0.1:${appConfig.config.serverPort}/)`;
    }

    console.log(`\nApplication is ready to accept requests${suffix}`);
  }
}
