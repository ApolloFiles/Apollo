import InvalidApolloURIError from './errors/InvalidApolloURIError.js';

export default class ApolloURI {
  public static readonly SCHEME = 'apollo';

  /** @throws InvalidApolloURIError */
  constructor(
    public readonly pathSegments: ReadonlyArray<string>,
  ) {
    for (const pathSegment of this.pathSegments) {
      if (pathSegment === '') {
        throw InvalidApolloURIError.createForPathSegmentCannotBeEmpty();
      }
      if (pathSegment === '.' || pathSegment === '..') {
        throw InvalidApolloURIError.createForPathSegmentCannotBeDots();
      }
      if (pathSegment.includes('/')) {
        throw InvalidApolloURIError.createForPathSegmentContainsSlash();
      }
      if (pathSegment.includes('\0')) {
        throw InvalidApolloURIError.createForPathSegmentContainsNulByte();
      }
    }
  }

  toString(): string {
    return new URL(ApolloURI.SCHEME + ':///' + this.pathSegments.map(encodeURIComponent).join('/')).toString();
  }

  /** @throws InvalidApolloURIError */
  static parse(uri: string): ApolloURI {
    let parsedUrl;
    try {
      // TODO: The URL constructor actually already normalizes '..', '.', and '//' which causes
      //       the explicit checks in the ApolloURI constructor to not work in #parse
      //       I would prefer being explicit about these cases not being supported,
      //       because right now a URI might be parsed and result in an unexpected result
      //       But right now, I also don't feel like parsing a URI manually or using a third party library for that...
      //       So I am acknowledging the limitation here for a future time, where an actual issue has been observed
      // FIXME: new lines are normalized by `new URL` but should be preserved
      parsedUrl = new URL(uri);
    } catch (err) {
      throw InvalidApolloURIError.createForUrlConstructorError(err);
    }

    if (parsedUrl.protocol !== 'apollo:') {
      throw InvalidApolloURIError.createForInvalidProtocol(parsedUrl.protocol);
    }

    // There are ideas to support a specific host for better cross-instance/decentralized URIs
    // but for now, we expect them to always be empty
    if (parsedUrl.host !== '' || parsedUrl.username !== '' || parsedUrl.password !== '' || parsedUrl.hash !== '') {
      throw InvalidApolloURIError.createForUnsupportedUriComponentsAreNonEmpty();
    }

    let pathToParse = parsedUrl.pathname;
    if (pathToParse.startsWith('/')) {
      pathToParse = pathToParse.substring(1);
    }
    if (pathToParse.endsWith('/')) {
      pathToParse = pathToParse.substring(0, pathToParse.length - 1);
    }

    if (pathToParse === '') {
      return new ApolloURI([]);
    }

    const pathSegments = pathToParse
      .split('/')
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch (err) {
          throw InvalidApolloURIError.createForMalformedPathSegmentEncoding(err);
        }
      });

    return new ApolloURI(pathSegments);
  }
}
