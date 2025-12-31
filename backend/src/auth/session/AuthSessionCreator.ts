import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { Prisma } from '../../database/prisma-client/client.js';
import AuthSessionFinder from './AuthSessionFinder.js';

type SessionResult = {
  id: bigint,
  token: string,
  remainingLifetimeInSeconds: number,
}

@singleton()
export default class AuthSessionCreator {
  private readonly THIRTY_DAYS_IN_S = 2_592_000 as const;
  private readonly EXTEND_THRESHOLD_MS = 1_209_600_000 as const; // 14 days

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly sessionFinder: AuthSessionFinder,
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

      const expiresAt = await this.determineExpiresAt(transaction);

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
    const token = this.createToken();
    const expiresAt = await this.determineExpiresAt(transaction);

    const session = await transaction.authSession.create({
      data: {
        hashedToken: token.sha256sum,
        userId,
        userAgent,
        expiresAt: expiresAt.value,
      },
      select: {
        id: true,
      },
    });

    return {
      id: session.id,
      token: token.value,
      remainingLifetimeInSeconds: expiresAt.expiresInSeconds,
    };
  }

  private createToken(): { value: string, sha256sum: Buffer<ArrayBuffer> } {
    const token = Crypto.randomBytes(64);

    return {
      value: token.toString('base64url'),
      sha256sum: Crypto.hash('sha256', token, { outputEncoding: 'buffer' }),
    };
  }

  private async determineExpiresAt(transaction: Prisma.TransactionClient): Promise<{ value: Date, expiresInSeconds: number }> {
    const expiresAt = await this.databaseClient.fetchNow(transaction);
    expiresAt.setTime(expiresAt.getTime() + (this.THIRTY_DAYS_IN_S * 1000));
    return {
      value: expiresAt,
      expiresInSeconds: this.THIRTY_DAYS_IN_S,
    };
  }
}
