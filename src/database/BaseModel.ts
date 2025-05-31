import ApolloUser from '../user/ApolloUser';

export default interface BaseModel {
  canRead(user: ApolloUser | null): boolean;
  canWrite(user: ApolloUser | null): boolean;
}
