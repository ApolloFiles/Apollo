import ApolloUrl from './ApolloURI.js';
import InvalidApolloFileURIError from './errors/InvalidApolloFileURIError.js';

export default class ApolloFileURI {
  /** @throws InvalidApolloFileURIError */
  constructor(
    public readonly apolloUrl: ApolloUrl,
  ) {
    if (this.apolloUrl.pathSegments[0] !== 'f') {
      throw InvalidApolloFileURIError.createForMissingFileUriPrefix();
    }
    if (this.apolloUrl.pathSegments.length < 3) {
      throw InvalidApolloFileURIError.createForMissingUserOrFileSystemId();
    }
  }

  get userId(): string {
    return this.apolloUrl.pathSegments[1];
  }

  get fileSystemId(): string {
    return this.apolloUrl.pathSegments[2];
  }

  get filePath(): string {
    return '/' + this.apolloUrl.pathSegments.slice(3).join('/');
  }

  toString(): string {
    return this.apolloUrl.toString();
  }

  /**
   * @throws InvalidApolloURIError
   * @throws InvalidApolloFileURIError
   * */
  static parse(url: string): ApolloFileURI {
    return new ApolloFileURI(ApolloUrl.parse(url));
  }

  static create(userId: string, fileSystemId: string, filePath: string): ApolloFileURI {
    let filePathSegments: string[] = [];

    if (filePath !== '/') {
      // TODO: Have ApolloURI and ApolloFileURI handle path normalization the same way
      if (filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
      if (filePath.endsWith('/')) {
        filePath = filePath.substring(0, filePath.length - 1);
      }

      filePathSegments = filePath.split('/');
    }

    return new ApolloFileURI(new ApolloUrl(['f', userId, fileSystemId, ...filePathSegments]));
  }
}
