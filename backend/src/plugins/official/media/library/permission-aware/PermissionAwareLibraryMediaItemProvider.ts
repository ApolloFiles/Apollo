import { singleton } from 'tsyringe';
import ResourceNotFoundError from '../../../../../permission/error/ResourceNotFoundError.js';
import MediaAccessContext from '../../../../../permission/media/MediaAccessContext.js';
import MediaLibraryPermissionEvaluator from '../../../../../permission/media/MediaLibraryPermissionEvaluator.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import MediaLibraryFinder from '../database/library/MediaLibraryFinder.js';
import MediaLibraryMediaItemFinder from '../database/media-item/MediaLibraryMediaItemFinder.js';
import ReadContentsAwareLibraryMediaItem from './ReadContentsAwareLibraryMediaItem.js';

@singleton()
export default class PermissionAwareLibraryMediaItemProvider {
  constructor(
    private readonly libraryFinder: MediaLibraryFinder,
    private readonly libraryMediaItemFinder: MediaLibraryMediaItemFinder,
    private readonly libraryPermissionEvaluator: MediaLibraryPermissionEvaluator,
  ) {
  }

  async provideForReadContents(itemId: bigint, user: ApolloUser): Promise<ReadContentsAwareLibraryMediaItem> {
    const libraryMediaItem = await this.libraryMediaItemFinder.findById(itemId);
    if (libraryMediaItem == null) {
      throw new ResourceNotFoundError();
    }

    const library = await this.libraryFinder.findById(libraryMediaItem.libraryId);
    if (library == null) {
      throw new ResourceNotFoundError();
    }

    await this.libraryPermissionEvaluator.ensureAllowed(new MediaAccessContext(user, library, 'read-contents'));
    return new ReadContentsAwareLibraryMediaItem(libraryMediaItem);
  }
}
