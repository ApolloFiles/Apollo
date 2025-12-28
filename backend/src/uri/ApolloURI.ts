import Path from 'node:path';

export default class ApolloURI {
  public static readonly SCHEME = 'apollo';

  constructor(
    public readonly pathSegments: ReadonlyArray<string>,
  ) {
    if (this.pathSegments.some(segment => segment.includes('/'))) {
      throw new Error('Path segments cannot contain "/" characters: ' + JSON.stringify(this.pathSegments));
    }
    if (this.pathSegments.some(segment => segment === '')) {
      throw new Error('Path segments cannot be empty: ' + JSON.stringify(this.pathSegments));
    }
  }

  toString(): string {
    return new URL(ApolloURI.SCHEME + ':///' + this.pathSegments.map(encodeURIComponent).join('/')).toString();
  }

  static parse(url: string): ApolloURI {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'apollo:') {
      throw new Error(`Expected protocol to be 'apollo:' but got ${JSON.stringify(parsedUrl.protocol)}`);
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
