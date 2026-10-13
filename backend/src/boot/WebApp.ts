import { type App, resolveEagerSingletons } from '@sprax/node-framework';
import { container } from 'tsyringe';
import { CacheNamespaceRegistry } from '../cache/internal/CacheNamespaceRegistry.js';
import { CacheStartupCheck } from '../cache/maintenance/CacheStartupCheck.js';
import AppConfiguration from '../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../constants.js';
import DatabaseClient from '../database/DatabaseClient.js';
import { DatabaseClockDriftCheck } from '../database/DatabaseClockDriftCheck.js';
import StartupCleaner from '../files/StartupCleaner.js';
import FfmpegDeviceRegistry from '../plugins/official/ffmpeg/accel/FfmpegDeviceRegistry.js';
import ApolloWebServer from '../webserver/server/ApolloWebServer.js';

export default class WebApp implements App {
  private webServer: ApolloWebServer | undefined;

  async boot(): Promise<void> {
    if (IS_PRODUCTION) {
      await container.resolve(DatabaseClient).runDatabaseMigrations();
    }

    resolveEagerSingletons();

    container.resolve(CacheNamespaceRegistry).close();
    await container.resolve(CacheStartupCheck).run();

    container.resolve(DatabaseClockDriftCheck).check()
      .then(checkResult => {
        if (checkResult.exceedsTolerance) {
          const driftSeconds = (checkResult.driftMs / 1000).toFixed(1);
          console.warn(
            `WARNING: The system clock of this server and the database clock differ by ${driftSeconds} seconds.\n` +
            'Running Apollo with clocks this far apart is not recommended and may lead to unexpected behavior.\n' +
            'Synchronize both machines with a time source (e.g. NTP) to resolve this.',
          );
        }
      })
      .catch(console.error);

    await container.resolve(StartupCleaner).cleanUp();
    container.resolve(FfmpegDeviceRegistry).getDevices().catch((err) => console.error('Failed to discover FFmpeg hardware devices', err));

    const appConfig = container.resolve(AppConfiguration);
    this.exposeInternalBackendUrlForFrontendSsr(appConfig);
    this.webServer = container.resolve(ApolloWebServer);

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
