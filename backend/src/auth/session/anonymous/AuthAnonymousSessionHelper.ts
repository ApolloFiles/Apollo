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
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  async create(data: object): Promise<SessionResult> {
    const token = this.secureTokenHelper.create();

    const session = await this.databaseClient.authAnonymousSession.create({
      data: {
        hashedToken: token.sha256sum,
        data,
      },
      select: { expiresAt: true },
    });

    return {
      token: token.value,
      remainingLifetimeInSeconds: Math.ceil((session.expiresAt.getTime() - (await this.databaseClient.fetchNow()).getTime()) / 1000),
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
}
