import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import ApolloUser from '../user/ApolloUser.js';
import AuthSessionFinder, { type SessionDataWithUser } from './session/AuthSessionFinder.js';

export type SessionUser = {
  session: SessionDataWithUser,
  user: ApolloUser,
}

@singleton()
export default class UserBySessionTokenProvider {
  private readonly inFlightFindBySessionToken = new Map<string, Promise<SessionUser | null>>();

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly authSessionFinder: AuthSessionFinder,
  ) {
  }

  async findBySessionTokenAndUpdateLastActivity(token: string): Promise<SessionUser | null> {
    if (this.inFlightFindBySessionToken.has(token)) {
      return await this.inFlightFindBySessionToken.get(token)!;
    }

    try {
      const task = this.executeFindBySessionTokenAndUpdateLastActivity(token);
      this.inFlightFindBySessionToken.set(token, task);
      return await task;
    } finally {
      this.inFlightFindBySessionToken.delete(token);
    }
  }

  private async executeFindBySessionTokenAndUpdateLastActivity(token: string): Promise<SessionUser | null> {
    const [session, now] = await Promise.all([
      this.authSessionFinder.findSession(token),
      this.databaseClient.fetchNow(),
    ]);

    if (session != null) {
      const expectedRoughLastActivity = this.normalizeToHour(now);

      if (session.roughLastActivity.getTime() !== expectedRoughLastActivity.getTime()) {
        console.log(`Updating last activity for session ${session.id} and user ${session.user.id}`);
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
      user: new ApolloUser(session.user.id, session.user.displayName, session.user.blocked, session.user.isSuperUser),
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
