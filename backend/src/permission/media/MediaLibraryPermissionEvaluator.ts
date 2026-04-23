import { singleton } from 'tsyringe';
import PermissionEvaluator from '../PermissionEvaluator.js';
import LibraryOwnerGrant from './grants/LibraryOwnerGrant.js';
import LibraryGotSharedGrant from './grants/LibraryGotSharedGrant.js';
import type MediaAccessContext from './MediaAccessContext.js';

@singleton()
export default class MediaLibraryPermissionEvaluator extends PermissionEvaluator<MediaAccessContext> {
  constructor(
    libraryOwnerGrant: LibraryOwnerGrant,
    librarySharedGrant: LibraryGotSharedGrant,
  ) {
    super(libraryOwnerGrant, librarySharedGrant);
  }
}
