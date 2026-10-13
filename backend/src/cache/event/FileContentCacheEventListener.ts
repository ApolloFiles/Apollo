import { EagerSingleton } from '@sprax/node-framework';
import type VirtualFile from '../../files/VirtualFile.js';
import EventRegistry from '../../plugins/builtin/event/EventRegistry.js';
import FileDeletedEvent from '../../plugins/builtin/event/events/FileDeletedEvent.js';
import FileRenamedEvent from '../../plugins/builtin/event/events/FileRenamedEvent.js';
import { CacheEntryDeleter } from '../internal/CacheEntryDeleter.js';
import { CacheNamespaceRegistry } from '../internal/CacheNamespaceRegistry.js';
import { UserCacheIndex } from '../internal/database/UserCacheIndex.js';
import { FileContentCacheKeyHelper } from '../internal/FileContentCacheKeyHelper.js';

/** @internal */
@EagerSingleton()
export class FileContentCacheEventListener {
  constructor(
    eventRegistry: EventRegistry,
    private readonly cacheNamespaceRegistry: CacheNamespaceRegistry,
    private readonly userCacheIndex: UserCacheIndex,
    private readonly cacheEntryDeleter: CacheEntryDeleter,
  ) {
    eventRegistry
      .for(FileDeletedEvent)
      .on((event) => this.deleteEntriesOf(event.file));

    eventRegistry
      .for(FileRenamedEvent)
      .on((event) => this.moveEntries(event.oldFile, event.newFile));
  }

  private async deleteEntriesOf(file: VirtualFile): Promise<void> {
    const owner = file.fileSystem.owner;
    if (owner == null) {
      return;
    }

    const deletedRows = await this.userCacheIndex.forUser(owner.id)
      .deleteFileGroups(this.cacheNamespaceRegistry.getFileContentNamespaces(), FileContentCacheKeyHelper.toGroupKey(file));
    await this.cacheEntryDeleter.deleteFilesOf(deletedRows);
  }

  private async moveEntries(oldFile: VirtualFile, newFile: VirtualFile): Promise<void> {
    const owner = oldFile.fileSystem.owner;
    if (owner == null) {
      return;
    }

    // Each owner has their own cache, so the entries cannot follow the file to another owner
    if (owner.id !== newFile.fileSystem.owner?.id) {
      await this.deleteEntriesOf(oldFile);
      return;
    }

    const replacedRows = await this.userCacheIndex.forUser(owner.id)
      .rekeyFileGroups(this.cacheNamespaceRegistry.getFileContentNamespaces(), FileContentCacheKeyHelper.toGroupKey(oldFile), FileContentCacheKeyHelper.toGroupKey(newFile));
    await this.cacheEntryDeleter.deleteFilesOf(replacedRows);
  }
}
