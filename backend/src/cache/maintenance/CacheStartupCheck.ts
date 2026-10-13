import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import NodeFsUtils from '../../utils/NodeFsUtils.js';
import { CacheRootError } from '../error/CacheRootError.js';
import { CacheFileStorage } from '../internal/CacheFileStorage.js';
import { UnknownCacheNamespaceFinder } from './UnknownCacheNamespaceFinder.js';

/**
 * Runs before the web server starts and refuses to start with a cache directory that is not usable
 * @internal
 */
@singleton()
export class CacheStartupCheck {
  constructor(
    private readonly cacheFileStorage: CacheFileStorage,
    private readonly unknownCacheNamespaceFinder: UnknownCacheNamespaceFinder,
  ) {
  }

  async run(): Promise<void> {
    const cacheRoot = this.cacheFileStorage.getCacheRootDirectory();

    try {
      await this.claimCacheRoot(cacheRoot);
      await this.cacheFileStorage.clearTemp();
      await this.checkWritable();
    } catch (err) {
      if (err instanceof CacheRootError) {
        throw err;
      }

      throw new CacheRootError(
        `The cache directory '${cacheRoot}' is not usable. Some features rely on the cache (e.g. to stay within the rate limits of external APIs), ` +
        'so Apollo does not start without it. Fix the directory\'s permissions or set APOLLO_CACHE_DIRECTORY to a usable directory.',
        { cause: err },
      );
    }

    // Not awaited: the scan reads both cache tables completely, and it only leads to warnings
    this.warnAboutUnknownNamespaces()
      .catch((err) => console.error('[ERROR] Could not look up unknown cache namespaces:', err));
  }

  private async claimCacheRoot(cacheRoot: string): Promise<void> {
    const directoryEntries = await NodeFsUtils.readdirIfExists(cacheRoot);

    if (directoryEntries.includes(CacheFileStorage.CACHE_ROOT_MARKER_FILE_NAME)) {
      return;
    }
    if (directoryEntries.length > 0) {
      throw new CacheRootError(
        `The cache directory '${cacheRoot}' is not empty, but it lacks the file '${CacheFileStorage.CACHE_ROOT_MARKER_FILE_NAME}' that marks Apollo's cache directories.\n` +
        'Apollo deletes content in its cache directory that it does not recognize, so it refuses to use this one.\n' +
        'Either empty the directory (caches of older Apollo versions in it can be deleted) ' +
        'or set APOLLO_CACHE_DIRECTORY to an empty or not yet existing directory.',
      );
    }

    await this.cacheFileStorage.createRootMarker();
  }

  private async checkWritable(): Promise<void> {
    const { tempPath } = await this.cacheFileStorage.allocateTemp();
    const renamedPath = `${tempPath}.renamed`;
    try {
      await this.cacheFileStorage.writeTemp(tempPath, Buffer.from('Apollo cache write test'));
      await Fs.promises.rename(tempPath, renamedPath);
    } finally {
      await this.cacheFileStorage.deleteTemp(tempPath);
      await this.cacheFileStorage.deleteTemp(renamedPath);
    }
  }

  private async warnAboutUnknownNamespaces(): Promise<void> {
    for (const unknown of await this.unknownCacheNamespaceFinder.find()) {
      console.warn(
        `[WARN] No registered cache uses the cache namespace '${unknown.namespace}' (${(unknown.sizeBytes / 1024 / 1024).toFixed(1)} MiB). ` +
        `Its entries will be deleted after ${unknown.deletableAfter.toISOString()}, unless a cache uses it again before then.`,
      );
    }
  }
}
