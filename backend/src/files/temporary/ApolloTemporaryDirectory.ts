import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../../config/ApolloDirectoryProvider.js';

@singleton()
export default class ApolloTemporaryDirectory {
  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
  }

  async create(): Promise<{ path: string, cleanup: () => Promise<void> }> {
    const baseDir = this.getTemporaryBaseDir();
    await Fs.promises.mkdir(baseDir, { recursive: true });
    const tmpDir = await Fs.promises.mkdtemp(Path.join(baseDir, '/'));

    return {
      path: tmpDir,
      cleanup: async () => {
        await Fs.promises.rm(tmpDir, { recursive: true, force: true });
      },
    };
  }

  async createScoped<R>(task: (tmpDir: string) => R | Promise<R>): Promise<R> {
    const tmpDir = await this.create();

    try {
      return await task(tmpDir.path);
    } finally {
      await tmpDir.cleanup();
    }
  }

  private getTemporaryBaseDir(): string {
    return Path.join(this.apolloDirectoryProvider.getAppTemporaryDirectory(), 'managed');
  }
}
