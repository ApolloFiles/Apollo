import type ApolloUser from '../../../user/ApolloUser.js';

export default class UserInFileUriNotFoundError extends Error {
  static create(userId: ApolloUser['id']): UserInFileUriNotFoundError {
    return new UserInFileUriNotFoundError('Cannot find ApolloUser in URI by ID: ' + userId);
  }
}
