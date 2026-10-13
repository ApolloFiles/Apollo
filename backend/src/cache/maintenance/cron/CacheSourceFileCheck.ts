import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import FileSystemProvider from '../../../files/FileSystemProvider.js';
import type VirtualFile from '../../../files/VirtualFile.js';
import type VirtualFileSystem from '../../../files/VirtualFileSystem.js';
import type ApolloUser from '../../../user/ApolloUser.js';
import UserProvider from '../../../user/UserProvider.js';
import { CacheEntryDeleter } from '../../internal/CacheEntryDeleter.js';
import { CacheNamespaceRegistry } from '../../internal/CacheNamespaceRegistry.js';
import { UserCacheIndex } from '../../internal/database/UserCacheIndex.js';
import { FileContentCacheKeyHelper } from '../../internal/FileContentCacheKeyHelper.js';

/**
 * Deletes the file-content entries of source files that no longer exist, which file events can miss.
 * Stats other users' files on purpose, bypassing the permission layer; it never reads their content.
 * @internal
 */
@singleton()
export class CacheSourceFileCheck {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly cacheNamespaceRegistry: CacheNamespaceRegistry,
    private readonly userProvider: UserProvider,
    private readonly fileSystemProvider: FileSystemProvider,
    private readonly userCacheIndex: UserCacheIndex,
    private readonly cacheEntryDeleter: CacheEntryDeleter,
  ) {
  }

  async run(): Promise<void> {
    const namespaces = this.cacheNamespaceRegistry.getFileContentNamespaces();
    if (namespaces.length === 0) {
      return;
    }

    let deletedCount = 0;
    for (const [userId, groupKeys] of await this.findGroupKeysByUser(namespaces)) {
      deletedCount += await this.checkUser(userId, groupKeys, namespaces);
    }

    if (deletedCount > 0) {
      console.info(`[INFO] Deleted ${deletedCount} cache entries whose source file no longer exists`);
    }
  }

  private async findGroupKeysByUser(namespaces: readonly string[]): Promise<Map<string, string[]>> {
    const groups = await this.databaseClient.cacheUserEntry.groupBy({
      by: ['userId', 'groupKey'],
      where: { namespace: { in: [...namespaces] }, groupKey: { not: null } },
    });

    const groupKeysByUser = new Map<string, string[]>();
    for (const group of groups) {
      const groupKeys = groupKeysByUser.get(group.userId) ?? [];
      groupKeys.push(group.groupKey!);
      groupKeysByUser.set(group.userId, groupKeys);
    }
    return groupKeysByUser;
  }

  private async checkUser(userId: string, groupKeys: string[], namespaces: readonly string[]): Promise<number> {
    try {
      const user = await this.userProvider.findById(userId);
      return user != null ? await this.deleteGroupsOfMissingFiles(user, groupKeys, namespaces) : 0;
    } catch (err) {
      console.warn(`[WARN] Skipping the cache source-file check of user ${userId}:`, err);
      return 0;
    }
  }

  private async deleteGroupsOfMissingFiles(user: ApolloUser, groupKeys: string[], namespaces: readonly string[]): Promise<number> {
    const fileSystems = await this.findCheckableFileSystems(user, new Set(groupKeys.map((groupKey) => FileContentCacheKeyHelper.parseGroupKey(groupKey).fileSystemId)));
    const index = this.userCacheIndex.forUser(user.id);

    let deletedCount = 0;
    for (const groupKey of groupKeys) {
      const { fileSystemId, path } = FileContentCacheKeyHelper.parseGroupKey(groupKey);
      const fileSystem = fileSystems.get(fileSystemId);
      if (fileSystem != null && await this.isGone(fileSystem.getFile(path))) {
        const deletedRows = await index.deleteFileGroups(namespaces, groupKey);
        await this.cacheEntryDeleter.deleteFilesOf(deletedRows);
        deletedCount += deletedRows.length;
      }
    }
    return deletedCount;
  }

  /** Leaves out file systems that are gone or look unmounted, so their entries survive until they are back */
  private async findCheckableFileSystems(user: ApolloUser, fileSystemIds: Set<string>): Promise<Map<string, VirtualFileSystem>> {
    const fileSystems = new Map((await this.fileSystemProvider.provideForUser(user)).user.map((fileSystem) => [fileSystem.id, fileSystem]));

    const checkableFileSystems = new Map<string, VirtualFileSystem>();
    for (const fileSystemId of fileSystemIds) {
      const fileSystem = fileSystems.get(fileSystemId);
      if (fileSystem == null) {
        console.warn(`[WARN] Skipping the cache source-file check of the file system '${fileSystemId}' of user ${user.id}: it does not exist`);
      } else if ((await fileSystem.getFile('/').getFiles()).length === 0) {
        console.warn(`[WARN] Skipping the cache source-file check of the file system '${fileSystemId}' of user ${user.id}: it is empty, so it may not be mounted`);
      } else {
        checkableFileSystems.set(fileSystemId, fileSystem);
      }
    }
    return checkableFileSystems;
  }

  private async isGone(file: VirtualFile): Promise<boolean> {
    try {
      await file.stat();
      return false;
    } catch (err: any) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        return true;
      }
      console.warn(`[WARN] Could not check whether '${file.path}' still exists – keeping its cache entries:`, err);
      return false;
    }
  }
}
