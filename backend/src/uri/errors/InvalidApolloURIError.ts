export default class InvalidApolloURIError extends Error {
  /** @internal */
  static createForUrlConstructorError(cause: unknown): InvalidApolloURIError {
    return new InvalidApolloURIError(`Cannot parse invalid URI`, { cause });
  }

  /** @internal */
  static createForMalformedPathSegmentEncoding(cause: unknown): InvalidApolloURIError {
    return new InvalidApolloURIError('Path segment contains malformed percent-encoding', { cause });
  }

  /** @internal */
  static createForInvalidProtocol(protocol: string): InvalidApolloURIError {
    return new InvalidApolloURIError(`Expected protocol to be "apollo:" but got ${JSON.stringify(protocol)}`);
  }

  /** @internal */
  static createForUnsupportedUriComponentsAreNonEmpty(): InvalidApolloURIError {
    return new InvalidApolloURIError('The URI contains non-empty host, username, password and/or hash components, which are expected to be empty');
  }

  /** @internal */
  static createForPathSegmentCannotBeEmpty(): InvalidApolloURIError {
    return new InvalidApolloURIError('Path segments cannot be empty');
  }

  /** @internal */
  static createForPathSegmentCannotBeDots(): InvalidApolloURIError {
    return new InvalidApolloURIError('Path segments cannot be "." or ".."');
  }

  /** @internal */
  static createForPathSegmentContainsSlash(): InvalidApolloURIError {
    return new InvalidApolloURIError('Path segments cannot contain "/"');
  }

  /** @internal */
  static createForPathSegmentContainsNulByte(): InvalidApolloURIError {
    return new InvalidApolloURIError('Path segments cannot contain NUL byte');
  }
}
