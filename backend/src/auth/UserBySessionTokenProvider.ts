import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import { Prisma } from '../database/prisma-client/client.js';
import ApolloUser from '../user/ApolloUser.js';
import AuthSessionFinder, { type SessionData, type SessionDataWithUser } from './session/AuthSessionFinder.js';

export type SessionUser = {
  session: SessionDataWithUser,
  user: ApolloUser,
}

@singleton()
export default class UserBySessionTokenProvider {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly authSessionFinder: AuthSessionFinder,
  ) {
  }

  async findBySessionToken(token: string, updateLastActivity: boolean): Promise<SessionUser | null> {
    const session = await this.databaseClient.$transaction(async (transaction) => {
      const session = await this.authSessionFinder.findSession(token, transaction);

      if (session != null && updateLastActivity) {
        await this.updateLastActivityIfNeeded(transaction, session);
      }

      if (session != null && updateLastActivity) {
        const now = await this.databaseClient.fetchNow(transaction);

        const normalizedNowToHour = this.normalizeToHour(now);
        if (normalizedNowToHour.getTime() !== session.roughLastActivity.getTime()) {
          await transaction.authSession.update({
            where: { id: session.id },
            data: { roughLastActivity: normalizedNowToHour },
            select: { id: true },
          });
        }

        const normalizedNowToDay = this.normalizeToDay(now);
        if (normalizedNowToDay.getTime() !== session.user.lastActivityDate?.getTime()) {
          await transaction.authUser.update({
            where: { id: session.user.id },
            data: { lastActivityDate: normalizedNowToDay },
            select: { id: true },
          });
        }
      }

      return session;
    });

    if (session == null) {
      return null;
    }

    return {
      session: session,
      user: new ApolloUser(session.user.id, session.user.displayName, session.user.blocked, session.user.isSuperUser),
    };
  }

  private async updateLastActivityIfNeeded(transaction: Prisma.TransactionClient, sessionData: SessionData): Promise<void> {
    const normalizedNow = this.normalizeToHour(await this.databaseClient.fetchNow(transaction));

    if (normalizedNow.getTime() !== sessionData.roughLastActivity.getTime()) {
      await transaction.authSession.update({
        where: { id: sessionData.id },
        data: { roughLastActivity: normalizedNow },
        select: { id: true },
      });
    }
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
