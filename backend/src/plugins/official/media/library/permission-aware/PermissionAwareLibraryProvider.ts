import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import ResourceNotFoundError from '../../../../../permission/error/ResourceNotFoundError.js';
import MediaAccessContext from '../../../../../permission/media/MediaAccessContext.js';
import MediaLibraryPermissionEvaluator from '../../../../../permission/media/MediaLibraryPermissionEvaluator.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import type FullLibrary from '../database/library/FullLibrary.js';
import MediaLibraryFinder from '../database/library/MediaLibraryFinder.js';
import ReadContentsAwareLibrary from './ReadContentsAwareLibrary.js';

@singleton()
export default class PermissionAwareLibraryProvider {
  constructor(
    private readonly libraryFinder: MediaLibraryFinder,
    private readonly libraryPermissionEvaluator: MediaLibraryPermissionEvaluator,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async provideForReadContents(libraryId: bigint, user: ApolloUser): Promise<ReadContentsAwareLibrary> {
    const library = await this.libraryFinder.findById(libraryId);
    if (library == null) {
      throw new ResourceNotFoundError();
    }

    await this.libraryPermissionEvaluator.ensureAllowed(new MediaAccessContext(user, library, 'read-contents'));
    return new ReadContentsAwareLibrary(library, this.databaseClient);
  }

  /**
   * @throws ResourceNotFoundError
   * @throws AccessForbiddenError
   */
  async provideForWrite(libraryId: bigint, user: ApolloUser): Promise<FullLibrary> {
    const library = await this.libraryFinder.findFullById(libraryId);
    if (library == null) {
      throw new ResourceNotFoundError();
    }

    await this.libraryPermissionEvaluator.ensureAllowed(new MediaAccessContext(user, library, 'write'));
    return library;
  }
}
