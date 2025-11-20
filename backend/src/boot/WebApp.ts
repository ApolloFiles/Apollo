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
    this.webServer = container.resolve(FastifyWebServer);

    await this.webServer.listen(appConfig.config.serverInterface, appConfig.config.serverPort);

    this.printReadyMessage(appConfig);
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
