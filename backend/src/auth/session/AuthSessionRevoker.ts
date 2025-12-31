import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';

@singleton()
export default class AuthSessionRevoker {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async revoke(sessionId: bigint, userId: string): Promise<void> {
    await this.databaseClient.authSession.delete({
      where: {
        id: sessionId,
        userId: userId,
      },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.databaseClient.authSession.deleteMany({
      where: { userId: userId },
    });
  }

  async revokeAllForUserExcept(userId: string, exceptSessionId: bigint): Promise<void> {
    await this.databaseClient.authSession.deleteMany({
      where: {
        userId: userId,
        id: { not: exceptSessionId },
      },
    });
  }
}
