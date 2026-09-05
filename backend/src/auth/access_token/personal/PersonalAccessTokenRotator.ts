import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import TokenRotationFailedError from '../error/TokenRotationFailedError.js';
import PersonalAccessTokenGenerator from './PersonalAccessTokenGenerator.js';

@singleton()
export default class PersonalAccessTokenRotator {
  constructor(
    private readonly tokenGenerator: PersonalAccessTokenGenerator,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async rotate(tokenId: bigint, userId: string): Promise<{ fullToken: string }> {
    return this.databaseClient.$transaction(async (transaction): Promise<{ fullToken: string }> => {
      await transaction.$queryRaw`
        SELECT
        FROM "auth_access_tokens"
        WHERE "id" = ${tokenId}
        FOR UPDATE
      `;

      const now = await this.databaseClient.fetchNow(transaction);

      const existingToken = await transaction.authAccessToken.findFirst({
        where: {
          id: tokenId,
          userId,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        select: { lifetimeSeconds: true },
      });
      if (existingToken == null) {
        throw new TokenRotationFailedError('Unable to rotate the given token (unknown id? already revoked? expired?)');
      }

      const newToken = this.tokenGenerator.generate();
      await transaction.authAccessToken.update({
        where: { id: tokenId },
        data: {
          hashedToken: newToken.tokenHash,
          tokenHint: newToken.tokenHint,
          expiresAt: this.determineExpiresAt(now, existingToken.lifetimeSeconds),
          rotatedAt: now,
        },
      });

      return { fullToken: newToken.fullToken };
    });
  }

  private determineExpiresAt(now: Date, lifetimeSeconds: number | null): Date | null {
    if (lifetimeSeconds == null) {
      return null;
    }

    const expiresAt = new Date(now);
    expiresAt.setTime(expiresAt.getTime() + (lifetimeSeconds * 1000));
    return expiresAt;
  }
}
