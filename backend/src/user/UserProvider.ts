import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import ApolloUser from './ApolloUser.js';

@singleton()
export default class UserProvider {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  // TODO: Remove when better-auth gets replaced with a better (fitting) auth
  async provideByAuthId(authId: string): Promise<ApolloUser | null> {
    return new ApolloUser(authId, `User ${authId}`);
  }

  async findAll(): Promise<ApolloUser[]> {
    const userIds = await this.databaseClient.user.findMany({
      select: { id: true },
    });

    const users: ApolloUser[] = [];
    for (const userId of userIds) {
      const user = await this.provideByAuthId(userId.id);
      if (user != null) {
        users.push(user);
      }
    }
    return users;
  }
}
