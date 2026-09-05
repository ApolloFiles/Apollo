import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import ApolloUser from '../../user/ApolloUser.js';
import AccessTokenFinder, { type AccessTokenDataWithUser } from './AccessTokenFinder.js';

export type AccessTokenUser = {
  accessToken: AccessTokenDataWithUser,
  user: ApolloUser,
}

@singleton()
export default class UserByAccessTokenProvider {
  private readonly inFlightFindByAccessToken = new Map<string, Promise<AccessTokenUser | null>>();

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly accessTokenFinder: AccessTokenFinder,
  ) {
  }

  async findByAccessTokenAndUpdateLastActivity(token: string): Promise<AccessTokenUser | null> {
    if (this.inFlightFindByAccessToken.has(token)) {
      return await this.inFlightFindByAccessToken.get(token)!;
    }

    try {
      const task = this.executeFindByAccessTokenAndUpdateLastActivity(token);
      this.inFlightFindByAccessToken.set(token, task);
      return await task;
    } finally {
      this.inFlightFindByAccessToken.delete(token);
    }
  }

  private async executeFindByAccessTokenAndUpdateLastActivity(token: string): Promise<AccessTokenUser | null> {
    const [accessToken, now] = await Promise.all([
      this.accessTokenFinder.findByToken(token),
      this.databaseClient.fetchNow(),
    ]);

    if (accessToken == null) {
      return null;
    }

    const expectedRoughLastUsedAt = this.normalizeToHour(now);
    if (accessToken.roughLastUsedAt?.getTime() !== expectedRoughLastUsedAt.getTime()) {
      await this.databaseClient.authAccessToken.update({
        where: { id: accessToken.id },
        data: { roughLastUsedAt: expectedRoughLastUsedAt },
      });
    }

    return {
      accessToken: accessToken,
      user: new ApolloUser(accessToken.user.id, accessToken.user.displayName, accessToken.user.blocked, accessToken.user.isSuperUser, accessToken.user.uiLanguage),
    };
  }

  private normalizeToHour(date: Date): Date {
    const normalized = new Date(date);
    normalized.setMinutes(0, 0, 0);
    return normalized;
  }
}
