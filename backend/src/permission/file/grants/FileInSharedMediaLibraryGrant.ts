import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import type ApolloUser from '../../../user/ApolloUser.js';
import Grant from '../../Grant.js';
import type FileAccessContext from '../FileAccessContext.js';

@singleton()
export default class FileInSharedMediaLibraryGrant extends Grant<FileAccessContext> {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
    super();
  }

  async check(ctx: FileAccessContext): Promise<boolean> {
    if (ctx.action !== 'read-in-media-context') {
      return false;
    }

    const sharedDirectoryUris = await this.fetchSharedLibraryDirectoryUris(ctx.subject);
    if (sharedDirectoryUris.length === 0) {
      return false;
    }

    const resourceUri = ctx.resource.toString();
    return sharedDirectoryUris.some(dirUri => resourceUri === dirUri || resourceUri.startsWith(dirUri + '/'));
  }

  private async fetchSharedLibraryDirectoryUris(user: ApolloUser): Promise<string[]> {
    const sharedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: {
        MediaLibrarySharedWith: { some: { userId: user.id } },
      },
      select: { directoryUris: true },
    });
    return sharedLibraries.flatMap(lib => lib.directoryUris);
  }
}
