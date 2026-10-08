export default class InvalidApolloFileURIError extends Error {
  override name = this.constructor.name;

  /** @internal */
  static createForMissingFileUriPrefix(): InvalidApolloFileURIError {
    return new InvalidApolloFileURIError('The provided URI is not an ApolloFileURI (it does not start with /f/)');
  }

  /** @internal */
  static createForMissingUserOrFileSystemId(): InvalidApolloFileURIError {
    return new InvalidApolloFileURIError('The provided URI is not an ApolloFileURI (missing userId and/or fileSystemId)');
  }
}
