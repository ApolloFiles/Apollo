export default class InvalidApolloURIError extends Error {
  /** @internal */
  static createForUrlConstructorError(cause: unknown): InvalidApolloURIError {
    throw new InvalidApolloURIError(`Cannot parse invalid URI`, { cause });
  }

  /** @internal */
  static createForInvalidProtocol(protocol: string): InvalidApolloURIError {
    throw new InvalidApolloURIError(`Expected protocol to be "apollo:" but got ${JSON.stringify(protocol)}`);
  }

  /** @internal */
  static createForPathSegmentContainsInvalidCharacter(): InvalidApolloURIError {
    throw new InvalidApolloURIError('Path segments cannot contain "/" characters');
  }

  /** @internal */
  static createForPathSegmentCannotBeEmpty(): InvalidApolloURIError {
    throw new InvalidApolloURIError('Path segments cannot be empty');
  }
}
