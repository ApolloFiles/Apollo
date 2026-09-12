import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import ApolloUser from '../../user/ApolloUser.js';
import InFlightRequestTracker from '../../utils/InFlightRequestTracker.js';
import AccessTokenFinder, { type AccessTokenDataWithUser } from './AccessTokenFinder.js';

export type AccessTokenUser = {
  accessToken: AccessTokenDataWithUser,
  user: ApolloUser,
}

@singleton()
export default class UserByAccessTokenProvider {
  private readonly inFlightRequests = new InFlightRequestTracker<AccessTokenUser | null>();

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly accessTokenFinder: AccessTokenFinder,
  ) {
  }

  findByAccessTokenAndUpdateLastActivity(token: string): Promise<AccessTokenUser | null> {
    return this.inFlightRequests.run(token, () => this.executeFindAndUpdate(token));
  }

  private async executeFindAndUpdate(token: string): Promise<AccessTokenUser | null> {
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
