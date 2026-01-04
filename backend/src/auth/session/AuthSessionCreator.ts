import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { Prisma } from '../../database/prisma-client/client.js';
import SecureTokenHelper from '../SecureTokenHelper.js';
import AuthSessionFinder from './AuthSessionFinder.js';

type SessionResult = {
  id: bigint,
  token: string,
  remainingLifetimeInSeconds: number,
}

type ExpiresAtResult = { value: Date, expiresInSeconds: number };

@singleton()
export default class AuthSessionCreator {
  private readonly THIRTY_DAYS_IN_S = 2_592_000 as const;
  private readonly EXTEND_THRESHOLD_MS = 1_209_600_000 as const; // 14 days

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly sessionFinder: AuthSessionFinder,
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  async create(userId: string, userAgent: string): Promise<SessionResult> {
    return this.createNewSession(userId, userAgent, this.databaseClient);
  }

  async extendLifetime(sessionToken: string): Promise<SessionResult> {
    return this.databaseClient.$transaction(async (transaction): Promise<SessionResult> => {
      const sessionData = await this.sessionFinder.findSession(sessionToken, transaction);

      if (sessionData == null) {
        throw new Error('Cannot extend session: session for token not found');
      }

      const expiresAt = this.determineExpiresAt(await this.databaseClient.fetchNow(transaction));

      await this.databaseClient.authSession.update({
        where: { id: sessionData.id },
        data: { expiresAt: expiresAt.value },
      });

      return {
        id: sessionData.id,
        token: sessionToken,
        remainingLifetimeInSeconds: expiresAt.expiresInSeconds,
      };
    });
  }

  private async createNewSession(userId: string, userAgent: string, transaction: Prisma.TransactionClient): Promise<SessionResult> {
    const token = this.secureTokenHelper.create();

    const now = await this.databaseClient.fetchNow(transaction);
    const expiresAt = this.determineExpiresAt(now);

    const session = await transaction.authSession.create({
      data: {
        hashedToken: token.sha256sum,
        userId,
        userAgent,
        expiresAt: expiresAt.value,
        roughLastActivity: this.normalizeToHour(now),
      },
      select: {
        id: true,
      },
    });

    await transaction.authUser.update({
      where: { id: userId },
      data: {
        lastLoginDate: this.normalizeToDay(now),
      },
    });

    return {
      id: session.id,
      token: token.value,
      remainingLifetimeInSeconds: expiresAt.expiresInSeconds,
    };
  }

  private determineExpiresAt(now: Date): ExpiresAtResult {
    const expiresAt = new Date(now);
    expiresAt.setTime(expiresAt.getTime() + (this.THIRTY_DAYS_IN_S * 1000));
    return {
      value: expiresAt,
      expiresInSeconds: this.THIRTY_DAYS_IN_S,
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
