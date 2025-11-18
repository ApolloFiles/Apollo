import type ApolloUser from '../../../../../user/ApolloUser.js';

export default interface BaseModel {
  canRead(user: ApolloUser | null): boolean;

  canWrite(user: ApolloUser | null): boolean;
}
