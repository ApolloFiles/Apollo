import ApolloUrl from './ApolloUrl';
import InvalidApolloUrlError from './InvalidApolloUrlError';

export default class ApolloFileUrl extends ApolloUrl {
  constructor(url: string) {
    super(url);

    if (this.apolloUrlPrefix !== 'f') {
      throw new InvalidApolloUrlError('The provided URL is not a ApolloFileUrl because the prefix is not "f"');
    }
    if (this.decodedPathSegments.length < 3) {
      throw new InvalidApolloUrlError('The provided URL is not a ApolloFileUrl because it is missing the userIdentifier and/or fileSystemIdentifier');
    }
  }

  get apolloUserIdentifier(): string {
    return this.decodedPathSegments[1];
  }

  get apolloFileSystemIdentifier(): string {
    return this.decodedPathSegments[2];
  }

  get apolloFilePath(): string {
    return '/' + this.decodedPathSegments.slice(3).join('/');
  }

  static create(userId: bigint, fileSystemId: bigint, filePath: string): ApolloFileUrl {
    return new ApolloFileUrl(`apollo:///f/${userId}/${fileSystemId}${filePath.startsWith('/') ? '' : '/'}${this.uriEncodePath(filePath)}`);
  }
}
