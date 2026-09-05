import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import TokenRevocationFailedError from './error/TokenRevocationFailedError.js';

@singleton()
export default class AccessTokenRevoker {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async revoke(tokenId: bigint, userId: string): Promise<void> {
    const now = await this.databaseClient.fetchNow();

    const result = await this.databaseClient.authAccessToken.updateMany({
      where: {
        id: tokenId,
        userId: userId,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },

      data: {
        hashedToken: null,
        revokedAt: now,
      },
    });

    if (result.count === 0) {
      throw new TokenRevocationFailedError('Unable to revoke the given token (unknown id? already revoked? expired?)');
    }
  }
}
