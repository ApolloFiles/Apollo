import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import type { AccessTokenData } from '../AccessTokenFinder.js';
import PersonalAccessTokenGenerator from './PersonalAccessTokenGenerator.js';

type TokenOptions = {
  name: string,
  description: string | null,
  lifetimeSeconds: number | null,
};

type CreatedToken = {
  fullToken: string,
  tokenData: AccessTokenData,
};

@singleton()
export default class PersonalAccessTokenCreator {
  constructor(
    private readonly tokenGenerator: PersonalAccessTokenGenerator,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async create(userId: string, options: TokenOptions): Promise<CreatedToken> {
    const expiresAt = await this.calculateExpiresAtTime(options.lifetimeSeconds);
    const generatedToken = this.tokenGenerator.generate();

    const createdToken = await this.databaseClient.authAccessToken.create({
      data: {
        userId,
        hashedToken: generatedToken.tokenHash,
        tokenHint: generatedToken.tokenHint,
        name: options.name,
        description: options.description,

        lifetimeSeconds: options.lifetimeSeconds,
        expiresAt,
      },

      select: {
        id: true,
        tokenHint: true,
        name: true,
        description: true,
        createdAt: true,
        expiresAt: true,
        rotatedAt: true,
        revokedAt: true,
        roughLastUsedAt: true,
      },
    });

    return {
      fullToken: generatedToken.fullToken,
      tokenData: createdToken,
    };
  }

  private async calculateExpiresAtTime(lifetimeSeconds: number | null): Promise<Date | null> {
    if (lifetimeSeconds == null) {
      return null;
    }

    if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds <= 0) {
      throw new Error('lifetimeSeconds must be a positive integer');
    }

    const expiresAt = await this.databaseClient.fetchNow();
    expiresAt.setTime(expiresAt.getTime() + (lifetimeSeconds * 1000));
    return expiresAt;
  }
}
