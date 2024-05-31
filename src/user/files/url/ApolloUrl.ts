import InvalidApolloUrlError from './InvalidApolloUrlError';

export default class ApolloUrl {
  protected readonly url: URL;

  constructor(url: string) {
    this.url = new URL(url);

    if (this.url.protocol !== 'apollo:') {
      throw new InvalidApolloUrlError('Expected protocol to be "apollo:" but got ' + JSON.stringify(this.url.protocol));
    }
    if (this.url.username !== '') {
      throw new InvalidApolloUrlError('Expected username to be empty but got ' + JSON.stringify(this.url.username));
    }
    if (this.url.password !== '') {
      throw new InvalidApolloUrlError('Expected password to be empty');
    }
  }

  get apolloUrlPrefix(): string {
    return this.decodedPathSegments[0] ?? '';
  }

  get decodedPathSegments(): string[] {
    if (this.url.pathname === '') {
      return [];
    }

    const result = this.url.pathname.slice(1)
      .split('/')
      .map(decodeURIComponent);
    if (this.url.pathname.endsWith('/')) {
      result.pop();
    }
    return result;
  }

  toString(): string {
    return this.url.toString();
  }

  protected static uriEncodePath(path: string): string {
    return path
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  }
}
