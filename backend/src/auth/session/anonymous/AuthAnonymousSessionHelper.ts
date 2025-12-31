import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import { Prisma } from '../../../database/prisma-client/client.js';

type SessionResult = {
  token: string,
  remainingLifetimeInSeconds: number,
}

@singleton()
export default class AuthAnonymousSessionHelper {
  private readonly TEN_MINUTES_IN_S = 600 as const;

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async create(data: object): Promise<SessionResult> {
    const token = this.createToken();
    const expiresAt = await this.determineExpiresAt(this.databaseClient);

    await this.databaseClient.authAnonymousSession.create({
      data: {
        hashedToken: token.sha256sum,
        data,
        expiresAt: expiresAt.value,
      },
      select: { hashedToken: true },
    });

    return {
      token: token.value,
      remainingLifetimeInSeconds: expiresAt.expiresInSeconds,
    };
  }

  async invalidate(token: string): Promise<Prisma.JsonValue> {
    const sessionData = await this.databaseClient.$transaction(async (transaction) => {
      const hashedToken = Crypto.hash('sha256', Buffer.from(token, 'base64url'), { outputEncoding: 'buffer' });

      const anonymousSession = await transaction.authAnonymousSession.findUnique({
        where: {
          hashedToken,
          expiresAt: { gt: await this.databaseClient.fetchNow(transaction) },
        },
        select: {
          data: true,
        },
      });

      if (anonymousSession != null) {
        await transaction.authAnonymousSession.delete({ where: { hashedToken } });
      }

      return anonymousSession?.data;
    });

    return sessionData ?? null;
  }

  // TODO: Method very similar to non-anonymous session creator, refactor to shared utility?
  private async determineExpiresAt(transaction: Prisma.TransactionClient): Promise<{
    value: Date,
    expiresInSeconds: number
  }> {
    const expiresAt = await this.databaseClient.fetchNow(transaction);
    expiresAt.setTime(expiresAt.getTime() + (this.TEN_MINUTES_IN_S * 1000));
    return {
      value: expiresAt,
      expiresInSeconds: this.TEN_MINUTES_IN_S,
    };
  }

  // TODO: Method is identical to non-anonymous session creator, refactor to shared utility
  private createToken(): { value: string, sha256sum: Buffer<ArrayBuffer> } {
    const token = Crypto.randomBytes(64);

    return {
      value: token.toString('base64url'),
      sha256sum: Crypto.hash('sha256', token, { outputEncoding: 'buffer' }),
    };
  }
}
