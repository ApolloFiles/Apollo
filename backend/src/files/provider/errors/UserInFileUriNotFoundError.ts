import type ApolloUser from '../../../user/ApolloUser.js';

export default class UserInFileUriNotFoundError extends Error {
  override name = this.constructor.name;

  static create(userId: ApolloUser['id']): UserInFileUriNotFoundError {
    return new UserInFileUriNotFoundError('Cannot find ApolloUser in URI by ID: ' + userId);
  }
}
