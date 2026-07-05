import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import ApolloUser from './ApolloUser.js';

@singleton()
export default class UserProvider {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findById(id: string): Promise<ApolloUser | null> {
    const userData = await this.databaseClient.authUser.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        displayName: true,
        isSuperUser: true,
        blocked: true,
        uiLanguage: true,
      },
    });

    if (userData == null) {
      return null;
    }

    return new ApolloUser(userData.id, userData.displayName, userData.blocked, userData.isSuperUser, userData.uiLanguage);
  }

  async findAll(includeBlockedUsers = true): Promise<ApolloUser[]> {
    const allUsers = await this.databaseClient.authUser.findMany({
      where: {
        ...(includeBlockedUsers ? {} : { blocked: false }),
      },
      select: {
        id: true,
        displayName: true,
        isSuperUser: true,
        blocked: true,
        uiLanguage: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const users: ApolloUser[] = [];
    for (const userData of allUsers) {
      users.push(new ApolloUser(userData.id, userData.displayName, userData.blocked, userData.isSuperUser, userData.uiLanguage));
    }
    return users;
  }

  async atLeastOneAccountExists(): Promise<boolean> {
    const someAccount = await this.databaseClient.authUser.findFirst({ select: { id: true } });
    return someAccount != null;
  }
}
