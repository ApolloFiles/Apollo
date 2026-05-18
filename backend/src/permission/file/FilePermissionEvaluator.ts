import { singleton } from 'tsyringe';
import PermissionEvaluator from '../PermissionEvaluator.js';
import type FileAccessContext from './FileAccessContext.js';
import FileInSharedMediaLibraryGrant from './grants/FileInSharedMediaLibraryGrant.js';
import FileOwnerGrant from './grants/FileOwnerGrant.js';

@singleton()
export default class FilePermissionEvaluator extends PermissionEvaluator<FileAccessContext> {
  constructor(
    fileOwnerGrant: FileOwnerGrant,
    fileIsPartOfSharedMediaLibraryGrant: FileInSharedMediaLibraryGrant,
  ) {
    super(fileOwnerGrant, fileIsPartOfSharedMediaLibraryGrant);
  }
}
