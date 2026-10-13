import { TimeUnit } from '@spraxdev/node-commons/util';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import { NodeFsUtils } from '../../../utils/NodeFsUtils.js';
import { CacheFileStorage } from '../../internal/CacheFileStorage.js';

interface NamespaceScope {
  userId: string | null;
  namespace: string;
  version: number;
}

interface StoredFile {
  id: bigint;
  fileId: string;
}

/**
 * Matches the cache directory against the index and removes what one of them lacks
 * @internal
 */
@singleton()
export class CacheVerifyJob {
  /** A file is briefly without a row between being moved into place and its row being committed */
  private static readonly MIN_ORPHAN_AGE_MS = TimeUnit.HOURS.toMillis(1);
  private static readonly DELETE_BATCH_SIZE = 1000;

  private currentRun: Promise<void> | null = null;

  constructor(
    private readonly cacheFileStorage: CacheFileStorage,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  run(): Promise<void> {
    this.currentRun ??= this.verify().finally(() => this.currentRun = null);
    return this.currentRun;
  }

  private async verify(): Promise<void> {
    const cacheRoot = this.cacheFileStorage.getCacheRootDirectory();
    if (!await this.cacheFileStorage.hasRootMarker()) {
      console.error(
        `[ERROR] Skipping the cache verification: '${cacheRoot}' lacks the file '${CacheFileStorage.CACHE_ROOT_MARKER_FILE_NAME}', ` +
        'so it may not be Apollo\'s cache directory right now (e.g. an unmounted share)',
      );
      return;
    }

    const orphanCutoff = Date.now() - CacheVerifyJob.MIN_ORPHAN_AGE_MS;
    const tempFiles = await this.deleteOldTempFiles(orphanCutoff);
    const userDirectories = await this.removeDirectoriesOfDeletedUsers();
    let filesWithoutEntry = 0;
    let entriesWithoutFile = 0;
    for (const [namespaceDirectory, scope] of await this.findNamespaceDirectories()) {
      const deleted = await this.verifyNamespaceDirectory(namespaceDirectory, scope, orphanCutoff);
      filesWithoutEntry += deleted.filesWithoutEntry;
      entriesWithoutFile += deleted.entriesWithoutFile;
    }

    if (tempFiles + userDirectories + filesWithoutEntry + entriesWithoutFile > 0) {
      console.info(
        `[INFO] Cache verification deleted ${tempFiles} old temp files, ${userDirectories} directories of deleted users, ` +
        `${filesWithoutEntry} files without an entry and ${entriesWithoutFile} entries without a file`,
      );
    }
  }

  private async deleteOldTempFiles(orphanCutoff: number): Promise<number> {
    const tempDirectory = this.cacheFileStorage.getTempDirectory();
    let deletedCount = 0;
    for (const name of await NodeFsUtils.readdirIfExists(tempDirectory)) {
      if (await this.deleteIfOlderThan(Path.join(tempDirectory, name), orphanCutoff)) {
        ++deletedCount;
      }
    }
    return deletedCount;
  }

  private async removeDirectoriesOfDeletedUsers(): Promise<number> {
    const userIds = await NodeFsUtils.readdirIfExists(this.cacheFileStorage.getUsersDirectory());
    const existingUsers = await this.databaseClient.authUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    const existingUserIds = new Set(existingUsers.map((user) => user.id));

    const deletedUserIds = userIds.filter((userId) => !existingUserIds.has(userId));
    for (const userId of deletedUserIds) {
      await this.cacheFileStorage.removeUserDirectory(userId);
    }
    return deletedUserIds.length;
  }

  /** The directories on disk and those the index has files in; scope is null for a directory without any */
  private async findNamespaceDirectories(): Promise<Map<string, NamespaceScope | null>> {
    const namespaceDirectories = new Map<string, NamespaceScope | null>();

    const userIds = await NodeFsUtils.readdirIfExists(this.cacheFileStorage.getUsersDirectory());
    for (const scopeDirectory of [null, ...userIds].map((userId) => this.cacheFileStorage.getScopeDirectory(userId))) {
      for (const entry of await NodeFsUtils.readdirWithTypesIfExists(scopeDirectory)) {
        if (entry.isDirectory()) {
          namespaceDirectories.set(Path.join(scopeDirectory, entry.name), null);
        }
      }
    }

    for (const scope of await this.findScopesWithFiles()) {
      namespaceDirectories.set(this.cacheFileStorage.getNamespaceDirectory(scope.userId, scope.namespace, scope.version), scope);
    }
    return namespaceDirectories;
  }

  private async findScopesWithFiles(): Promise<NamespaceScope[]> {
    const appGroups = await this.databaseClient.cacheAppEntry.groupBy({
      by: ['namespace', 'version'],
      where: { isNull: false },
    });
    const userGroups = await this.databaseClient.cacheUserEntry.groupBy({
      by: ['userId', 'namespace', 'version'],
      where: { isNull: false },
    });
    return [...appGroups.map((group) => ({ ...group, userId: null })), ...userGroups];
  }

  /** Loads the rows before walking the files: a row committed later has its file in place already */
  private async verifyNamespaceDirectory(
    namespaceDirectory: string,
    scope: NamespaceScope | null,
    orphanCutoff: number,
  ): Promise<{ filesWithoutEntry: number, entriesWithoutFile: number }> {
    const storedFiles = scope != null ? await this.findStoredFiles(scope) : [];
    const storedFileIds = new Set(storedFiles.map((storedFile) => storedFile.fileId));

    const foundFileIds = new Set<string>();
    let filesWithoutEntry = 0;
    for (const shard of await NodeFsUtils.readdirWithTypesIfExists(namespaceDirectory)) {
      filesWithoutEntry += await this.verifyShard(shard, storedFileIds, foundFileIds, orphanCutoff);
    }
    await this.removeIfEmpty(namespaceDirectory);

    const entriesWithoutFile = scope != null
      ? await this.deleteRows(scope, storedFiles.filter((storedFile) => !foundFileIds.has(storedFile.fileId)))
      : 0;
    return { filesWithoutEntry, entriesWithoutFile };
  }

  /** Deletes the old files that have no row, collecting those that have one */
  private async verifyShard(shard: Fs.Dirent, storedFileIds: Set<string>, foundFileIds: Set<string>, orphanCutoff: number): Promise<number> {
    const shardPath = Path.join(shard.parentPath, shard.name);
    if (!shard.isDirectory()) {
      return await this.deleteIfOlderThan(shardPath, orphanCutoff) ? 1 : 0;
    }

    let deletedCount = 0;
    for (const fileName of await NodeFsUtils.readdirIfExists(shardPath)) {
      if (storedFileIds.has(fileName) && fileName.startsWith(shard.name)) {
        foundFileIds.add(fileName);
      } else if (await this.deleteIfOlderThan(Path.join(shardPath, fileName), orphanCutoff)) {
        ++deletedCount;
      }
    }
    await this.removeIfEmpty(shardPath);
    return deletedCount;
  }

  private async findStoredFiles(scope: NamespaceScope): Promise<StoredFile[]> {
    const where = { namespace: scope.namespace, version: scope.version, isNull: false };
    const select = { id: true, fileId: true };
    const rows = scope.userId == null
      ? await this.databaseClient.cacheAppEntry.findMany({ where, select })
      : await this.databaseClient.cacheUserEntry.findMany({ where: { ...where, userId: scope.userId }, select });
    return rows.flatMap((row) => row.fileId != null ? [{ id: row.id, fileId: row.fileId }] : []);
  }

  /** Matching the file id as well keeps an entry overwritten in the meantime */
  private async deleteRows(scope: NamespaceScope, storedFiles: StoredFile[]): Promise<number> {
    let deletedCount = 0;
    for (let i = 0; i < storedFiles.length; i += CacheVerifyJob.DELETE_BATCH_SIZE) {
      const batch = storedFiles.slice(i, i + CacheVerifyJob.DELETE_BATCH_SIZE);
      const where = {
        id: { in: batch.map((storedFile) => storedFile.id) },
        fileId: { in: batch.map((storedFile) => storedFile.fileId) },
      };

      const result = scope.userId == null
        ? await this.databaseClient.cacheAppEntry.deleteMany({ where })
        : await this.databaseClient.cacheUserEntry.deleteMany({ where: { ...where, userId: scope.userId } });
      deletedCount += result.count;
    }
    return deletedCount;
  }

  private async deleteIfOlderThan(path: string, cutoff: number): Promise<boolean> {
    const stats = await NodeFsUtils.nullIfMissing(Fs.promises.lstat(path));
    if (stats == null || stats.mtimeMs >= cutoff) {
      return false;
    }

    await Fs.promises.rm(path, { recursive: true, force: true });
    return true;
  }

  /** A write that created the directory just before it is removed fails, which is only a cache miss */
  private async removeIfEmpty(directory: string): Promise<void> {
    await Fs.promises.rmdir(directory).catch((err) => {
      if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes(err.code)) {
        throw err;
      }
    });
  }
}
