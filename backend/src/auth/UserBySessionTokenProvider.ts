import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import ApolloUser from '../user/ApolloUser.js';
import InFlightRequestTracker from '../utils/InFlightRequestTracker.js';
import AuthSessionFinder, { type SessionDataWithUser } from './session/AuthSessionFinder.js';

export type SessionUser = {
  session: SessionDataWithUser,
  user: ApolloUser,
}

@singleton()
export default class UserBySessionTokenProvider {
  private readonly inFlightRequests = new InFlightRequestTracker<SessionUser | null>();

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly authSessionFinder: AuthSessionFinder,
  ) {
  }

  findBySessionTokenAndUpdateLastActivity(token: string): Promise<SessionUser | null> {
    return this.inFlightRequests.run(token, () => this.executeFindAndUpdate(token));
  }

  private async executeFindAndUpdate(token: string): Promise<SessionUser | null> {
    const [session, now] = await Promise.all([
      this.authSessionFinder.findSession(token),
      this.databaseClient.fetchNow(),
    ]);

    if (session != null) {
      const expectedRoughLastActivity = this.normalizeToHour(now);

      if (session.roughLastActivity.getTime() !== expectedRoughLastActivity.getTime()) {
        await this.databaseClient.$transaction([
          this.databaseClient.authSession.update({
            where: { id: session.id },
            data: { roughLastActivity: expectedRoughLastActivity },
          }),

          this.databaseClient.authUser.update({
            where: { id: session.user.id },
            data: { lastActivityDate: this.normalizeToDay(now) },
          }),
        ]);
      }
    }

    if (session == null) {
      return null;
    }

    return {
      session: session,
      user: new ApolloUser(session.user.id, session.user.displayName, session.user.blocked, session.user.isSuperUser, session.user.uiLanguage),
    };
  }

  private normalizeToHour(date: Date): Date {
    const normalized = new Date(date);
    normalized.setMinutes(0, 0, 0);
    return normalized;
  }

  private normalizeToDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }
}
