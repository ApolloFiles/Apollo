import Path from 'node:path';
import { singleton } from 'tsyringe';
import NodeFsUtils from '../utils/NodeFsUtils.js';
import AppConfiguration from './AppConfiguration.js';

@singleton()
export default class ApolloDirectoryProvider {
  constructor(
    private readonly appConfiguration: AppConfiguration,
  ) {
  }

  getAppTemporaryDirectory(): string {
    return Path.join(this.getApolloDataDirectory(), 'tmp');
  }

  getUserFileSystemDirectory(userId: string): string {
    return Path.join(this.getUserDataDirectory(userId), 'fs');
  }

  async findAllUserTemporaryDirectories(): Promise<string[]> {
    const tempDirs: string[] = [];

    const baseDir = Path.join(this.getApolloDataDirectory(), 'users');

    const dirsInBaseDir = await NodeFsUtils.readdirWithTypesIfExists(baseDir);
    for (const dirent of dirsInBaseDir) {
      if (!dirent.isDirectory()) {
        continue;
      }

      tempDirs.push(Path.join(baseDir, dirent.name, '_tmp'));
    }

    return tempDirs;
  }

  private getUserDataDirectory(userId: string): string {
    return Path.join(this.getApolloDataDirectory(), 'users', userId);
  }

  private getApolloDataDirectory(): string {
    return this.appConfiguration.config.paths.dataDirectory;
  }
}
