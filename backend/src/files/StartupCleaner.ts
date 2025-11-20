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
    await Fs.promises.rm(this.apolloDirectoryProvider.getTemporaryBaseDirectory(), { recursive: true, force: true });
  }
}
