import { singleton } from 'tsyringe';
import ApolloUser from './ApolloUser.js';

@singleton()
export default class UserProvider {
  // TODO: Remove when better-auth gets replaced with a better (fitting) auth
  async provideByAuthId(authId: string): Promise<ApolloUser | null> {
    return new ApolloUser(authId, `User ${authId}`);
  }
}
