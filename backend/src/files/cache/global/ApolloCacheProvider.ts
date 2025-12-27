import Crypto from 'node:crypto';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../../../config/ApolloDirectoryProvider.js';

@singleton()
export default class ApolloCacheProvider {
  private readonly PREFIX_PATTERN = /^[a-z0-9_.=@+-]+$/i;

  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
    private readonly subDirName = 'default',
  ) {
  }

  async getCachePath(idPrefix: string, identifier: string): Promise<string> {
    if (!this.PREFIX_PATTERN.test(idPrefix)) {
      throw new Error(`Cache idPrefix may only contain specific characters (${this.PREFIX_PATTERN.toString()})`);
    }

    return this.determineCacheFilePath(idPrefix, identifier);
  }

  private determineCacheFilePath(idPrefix: string, identifier: string): string {
    const identifierHash = this.calculateHash(identifier);
    const pathSegment1 = identifierHash.slice(0, 2);
    const pathSegment2 = identifierHash.slice(2, 4);
    const pathSegment3 = identifierHash.slice(4);

    return Path.join(this.determineBasePath(idPrefix), pathSegment1, pathSegment2, pathSegment3);
  }

  private determineBasePath(idPrefix: string): string {
    return Path.join(this.apolloDirectoryProvider.getCacheBaseDirectory(), this.subDirName, idPrefix);
  }

  private calculateHash(input: string): string {
    return Crypto
      .createHash('sha256')
      .update(input)
      .digest('hex');
  }
}
