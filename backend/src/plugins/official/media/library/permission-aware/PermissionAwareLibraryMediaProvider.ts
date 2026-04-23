import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import ResourceNotFoundError from '../../../../../permission/error/ResourceNotFoundError.js';
import MediaAccessContext from '../../../../../permission/media/MediaAccessContext.js';
import MediaLibraryPermissionEvaluator from '../../../../../permission/media/MediaLibraryPermissionEvaluator.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import MediaLibraryFinder from '../database/library/MediaLibraryFinder.js';
import MediaLibraryMediaFinder from '../database/media/MediaLibraryMediaFinder.js';
import ReadContentsAwareLibraryMedia from './ReadContentsAwareLibraryMedia.js';

@singleton()
export default class PermissionAwareLibraryMediaProvider {
  constructor(
    private readonly libraryFinder: MediaLibraryFinder,
    private readonly libraryMediaFinder: MediaLibraryMediaFinder,
    private readonly libraryPermissionEvaluator: MediaLibraryPermissionEvaluator,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async provideForReadContents(mediaId: bigint, user: ApolloUser): Promise<ReadContentsAwareLibraryMedia> {
    const libraryMedia = await this.libraryMediaFinder.findById(mediaId);
    if (libraryMedia == null) {
      throw new ResourceNotFoundError();
    }

    const library = await this.libraryFinder.findById(libraryMedia.libraryId);
    if (library == null) {
      throw new ResourceNotFoundError();
    }

    await this.libraryPermissionEvaluator.ensureAllowed(new MediaAccessContext(user, library, 'read-contents'));
    return new ReadContentsAwareLibraryMedia(libraryMedia, this.databaseClient);
  }
}
