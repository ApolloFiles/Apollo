import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import { Prisma } from '../../../database/prisma-client/client.js';
import SecureTokenHelper from '../../SecureTokenHelper.js';

type SessionResult = {
  token: string,
  remainingLifetimeInSeconds: number,
}

@singleton()
export default class AuthAnonymousSessionHelper {
  private readonly TEN_MINUTES_IN_S = 600 as const;

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  async create(data: object): Promise<SessionResult> {
    const token = this.secureTokenHelper.create();
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
      const hashedToken = this.secureTokenHelper.hashToken(token);

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
}
