import type { IncomingHttpHeaders } from 'node:http';
import { singleton } from 'tsyringe';
import type ApolloUser from '../user/ApolloUser.js';
import UserProvider from '../user/UserProvider.js';
import { auth, convertHeadersIntoBetterAuthFormat } from '../utils/auth.js';

@singleton()
export default class UserByAuthProvider {
  constructor(
    private readonly userProvider: UserProvider,
  ) {
  }

  async provideByHeaders(headers: IncomingHttpHeaders): Promise<ApolloUser | null> {
    const sessionInfo = await auth.api.getSession({
      headers: convertHeadersIntoBetterAuthFormat(headers),
    });

    if (sessionInfo == null) {
      return null;
    }

    const apolloUser = await this.userProvider.provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Header contained a session that could not be resolved to an ApolloUser');
    }

    return apolloUser;
  }
}
