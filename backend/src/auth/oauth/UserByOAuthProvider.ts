import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import ApolloUser from '../../user/ApolloUser.js';
import type { OAuthType } from './OAuthConfigurationProvider.js';

@singleton()
export default class UserByOAuthProvider {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async provide(type: OAuthType, providerUserId: string): Promise<ApolloUser | null> {
    const user = await this.databaseClient.authUser.findFirst({
      where: {
        linkedAuthProviders: {
          some: {
            provider: type,
            providerUserId,
          },
        },
      },
      select: {
        id: true,
        displayName: true,
        isSuperUser: true,
        blocked: true,
      },
    });

    if (user == null) {
      return null;
    }
    return new ApolloUser(user.id, user.displayName, user.blocked, user.isSuperUser);
  }
}
