import Path from 'node:path';
import { singleton } from 'tsyringe';
import AppConfiguration from './AppConfiguration.js';

@singleton()
export default class ApolloDirectoryProvider {
  constructor(
    private readonly appConfiguration: AppConfiguration,
  ) {
  }

  getTemporaryBaseDirectory(): string {
    return Path.join(this.getApolloDataDirectory(), 'tmp');
  }

  getCacheBaseDirectory(): string {
    return Path.join(this.getApolloDataDirectory(), 'cache');
  }

  getAppTemporaryDirectory(): string {
    return Path.join(this.getTemporaryBaseDirectory(), 'app');
  }

  getUserTemporaryDirectory(userId: string): string {
    return Path.join(this.getTemporaryBaseDirectory(), 'user', userId);
  }

  getUserFileSystemDirectory(userId: string): string {
    return Path.join(this.getUserDataDirectory(userId), 'fs');
  }

  private getUserDataDirectory(userId: string): string {
    return Path.join(this.getApolloDataDirectory(), 'users', userId);
  }

  private getApolloDataDirectory(): string {
    return this.appConfiguration.config.paths.dataDirectory;
  }
}
