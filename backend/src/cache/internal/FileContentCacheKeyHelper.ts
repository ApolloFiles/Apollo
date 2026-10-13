import type VirtualFile from '../../files/VirtualFile.js';

/** @internal */
export class FileContentCacheKeyHelper {
  // entry names may never contain `|`
  private static readonly ENTRY_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

  /** Only unique together with the file system's owner, as file system IDs are only unique per user */
  static toGroupKey(file: VirtualFile): string {
    return `${file.fileSystem.id}:${file.path}`;
  }

  static parseGroupKey(groupKey: string): { fileSystemId: string, path: string } {
    const separatorIndex = groupKey.indexOf(':');
    return { fileSystemId: groupKey.slice(0, separatorIndex), path: groupKey.slice(separatorIndex + 1) };
  }

  static toEntryKey(file: VirtualFile, entryName: string): string {
    if (!FileContentCacheKeyHelper.ENTRY_NAME_PATTERN.test(entryName)) {
      throw new Error(`Invalid cache entry name '${entryName}': it must match ${FileContentCacheKeyHelper.ENTRY_NAME_PATTERN}`);
    }
    return `${FileContentCacheKeyHelper.toGroupKey(file)}|${entryName}`;
  }
}
