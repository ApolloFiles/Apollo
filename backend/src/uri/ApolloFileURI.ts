import ApolloUrl from './ApolloURI.js';

export default class ApolloFileURI {
  constructor(
    public readonly apolloUrl: ApolloUrl,
  ) {
    if (this.apolloUrl.pathSegments[0] !== 'f') {
      throw new Error('The provided URL is not a ApolloFileUrl (does not start with /f/)');
    }
    if (this.apolloUrl.pathSegments.length < 3) {
      throw new Error('The provided URL is not a ApolloFileUrl (missing userId and/or fileSystemId)');
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

  static parse(url: string): ApolloFileURI {
    return new ApolloFileURI(ApolloUrl.parse(url));
  }

  static create(userId: string, fileSystemId: string, filePath: string): ApolloFileURI {
    // TODO: Have ApolloURI and ApolloFileURI handle path normalization the same way
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    if (filePath.endsWith('/')) {
      filePath = filePath.substring(0, filePath.length - 1);
    }

    return new ApolloFileURI(new ApolloUrl(['f', userId, fileSystemId, ...filePath.split('/')]));
  }
}
