import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../config/ApolloDirectoryProvider.js';

@singleton()
export default class StartupCleaner {
  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
  }

  async cleanUp(): Promise<void> {
    await Fs.promises.rm(this.apolloDirectoryProvider.getAppTemporaryDirectory(), { recursive: true, force: true });
    await this.cleanUpAllUserTempDirs();
  }

  private async cleanUpAllUserTempDirs(): Promise<void> {
    const userTempDirs = await this.apolloDirectoryProvider.findAllUserTemporaryDirectories();
    for (const dir of userTempDirs) {
      await Fs.promises.rm(dir, { recursive: true, force: true });
    }
  }
}
