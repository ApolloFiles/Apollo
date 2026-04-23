import { singleton } from 'tsyringe';
import MediaLibraryByUserFinder
  from '../../../plugins/official/media/library/database/library/MediaLibraryByUserFinder.js';
import Grant from '../../Grant.js';
import type MediaAccessContext from '../MediaAccessContext.js';

@singleton()
export default class LibraryGotSharedGrant extends Grant<MediaAccessContext> {
  constructor(
    private readonly mediaLibraryByUserFinder: MediaLibraryByUserFinder,
  ) {
    super();
  }

  async check(ctx: MediaAccessContext): Promise<boolean> {
    if (ctx.action === 'read-contents') {
      return this.mediaLibraryByUserFinder.gotLibraryShared(ctx.subject.id, ctx.resource.id);
    }

    // sharing a library does not grant any other permissions/actions
    return false;
  }
}
