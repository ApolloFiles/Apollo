import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../../config/ApolloDirectoryProvider.js';

/** @internal */
export interface CacheFileLocation {
  readonly userId: string | null;
  readonly namespace: string;
  readonly version: number;
  readonly fileId: string;
}

/** @internal */
@singleton()
export class CacheFileStorage {
  private static readonly CACHE_ROOT_MARKER_CONTENT = [
    'This directory is the cache of Apollo (APOLLO_CACHE_DIRECTORY).',
    'Apollo deletes content in here it does not recognize, so do not store anything else in this directory.',
    'Do not copy this file into another directory: Apollo would then treat that directory as a cache as well.',
    '',
  ].join('\n');
  public static readonly CACHE_ROOT_MARKER_FILE_NAME = '.apollo-cache-root';

  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
  }

  async allocateTemp(): Promise<{ fileId: string, tempPath: string }> {
    await Fs.promises.mkdir(this.getTempDirectory(), { recursive: true });

    const fileId = Crypto.randomUUID();
    return { fileId, tempPath: Path.join(this.getTempDirectory(), fileId) };
  }

  async writeTemp(tempPath: string, data: Buffer): Promise<void> {
    await Fs.promises.writeFile(tempPath, data);
  }

  async deleteTemp(tempPath: string): Promise<void> {
    await Fs.promises.rm(tempPath, { force: true });
  }

  async moveIntoPlace(tempPath: string, location: CacheFileLocation): Promise<void> {
    const targetFilePath = this.resolveFilePath(location);
    await Fs.promises.mkdir(Path.dirname(targetFilePath), { recursive: true });
    await Fs.promises.rename(tempPath, targetFilePath);
  }

  open(location: CacheFileLocation): Promise<Fs.promises.FileHandle> {
    return Fs.promises.open(this.resolveFilePath(location), 'r');
  }

  async deleteFile(location: CacheFileLocation): Promise<void> {
    await Fs.promises.rm(this.resolveFilePath(location), { force: true });
  }

  async clearTemp(): Promise<void> {
    await Fs.promises.rm(this.getTempDirectory(), { recursive: true, force: true });
    await Fs.promises.mkdir(this.getTempDirectory(), { recursive: true });
  }

  async removeUserDirectory(userId: string): Promise<void> {
    await Fs.promises.rm(this.getScopeDirectory(userId), { recursive: true, force: true });
  }

  getNamespaceDirectory(userId: string | null, namespace: string, version: number): string {
    return Path.join(this.getScopeDirectory(userId), `${namespace}@${version}`);
  }

  /** Holds the namespace directories of the app, or of one user */
  getScopeDirectory(userId: string | null): string {
    return userId == null ? Path.join(this.getCacheRootDirectory(), 'app') : Path.join(this.getUsersDirectory(), userId);
  }

  getUsersDirectory(): string {
    return Path.join(this.getCacheRootDirectory(), 'user');
  }

  /** Without it, the directory may not be Apollo's cache right now (e.g. an unmounted share), so nothing may be deleted */
  async hasRootMarker(): Promise<boolean> {
    return Fs.promises.access(this.getRootMarkerPath())
      .then(() => true, () => false);
  }

  async createRootMarker(): Promise<void> {
    await Fs.promises.mkdir(this.getCacheRootDirectory(), { recursive: true });
    await Fs.promises.writeFile(this.getRootMarkerPath(), CacheFileStorage.CACHE_ROOT_MARKER_CONTENT);
  }

  getCacheRootDirectory(): string {
    return this.apolloDirectoryProvider.getCacheBaseDirectory();
  }

  getTempDirectory(): string {
    return Path.join(this.getCacheRootDirectory(), '.tmp');
  }

  private getRootMarkerPath(): string {
    return Path.join(this.getCacheRootDirectory(), CacheFileStorage.CACHE_ROOT_MARKER_FILE_NAME);
  }

  private resolveFilePath(location: CacheFileLocation): string {
    const namespaceDirectory = this.getNamespaceDirectory(location.userId, location.namespace, location.version);
    return Path.join(namespaceDirectory, location.fileId.slice(0, 2), location.fileId);
  }
}
