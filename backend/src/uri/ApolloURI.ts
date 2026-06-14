import Path from 'node:path';
import InvalidApolloURIError from './errors/InvalidApolloURIError.js';

export default class ApolloURI {
  public static readonly SCHEME = 'apollo';

  /** @throws InvalidApolloURIError */
  constructor(
    public readonly pathSegments: ReadonlyArray<string>,
  ) {
    if (this.pathSegments.some(segment => segment.includes('/'))) {
      throw InvalidApolloURIError.createForPathSegmentContainsInvalidCharacter();
    }
    if (this.pathSegments.some(segment => segment === '')) {
      throw InvalidApolloURIError.createForPathSegmentCannotBeEmpty();
    }
  }

  toString(): string {
    return new URL(ApolloURI.SCHEME + ':///' + this.pathSegments.map(encodeURIComponent).join('/')).toString();
  }

  /** @throws InvalidApolloURIError */
  static parse(url: string): ApolloURI {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      throw InvalidApolloURIError.createForUrlConstructorError(err);
    }

    if (parsedUrl.protocol !== 'apollo:') {
      throw InvalidApolloURIError.createForInvalidProtocol(parsedUrl.protocol);
    }

    let pathToParse = Path.normalize(parsedUrl.pathname);
    if (pathToParse.startsWith('/')) {
      pathToParse = pathToParse.substring(1);
    }
    if (pathToParse.endsWith('/')) {
      pathToParse = pathToParse.substring(0, pathToParse.length - 1);
    }

    const pathSegments = pathToParse
      .split('/')
      .map(decodeURIComponent);

    return new ApolloURI(pathSegments);
  }
}
