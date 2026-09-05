import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import SecureTokenHelper from '../SecureTokenHelper.js';

export type AccessTokenData = {
  id: bigint,
  tokenHint: string,
  name: string,
  description: string | null,
  createdAt: Date,
  expiresAt: Date | null,
  rotatedAt: Date | null,
  revokedAt: Date | null,
  roughLastUsedAt: Date | null,
}

export type AccessTokenDataWithUser = AccessTokenData & {
  user: {
    id: string,
    displayName: string,
    isSuperUser: boolean,
    blocked: boolean,
    lastActivityDate: Date | null,
    uiLanguage: string | null,
  },
}

@singleton()
export default class AccessTokenFinder {
  constructor(
    private readonly secureTokenHelper: SecureTokenHelper,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findByToken(rawToken: string): Promise<AccessTokenDataWithUser | null> {
    const now = await this.databaseClient.fetchNow();

    const accessToken = await this.databaseClient.authAccessToken.findUnique({
      where: {
        hashedToken: this.secureTokenHelper.hashToken(rawToken),
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
        user: {
          // Tokens for blocked users are invalid
          blocked: false,
        },
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
        user: {
          select: {
            id: true,
            displayName: true,
            isSuperUser: true,
            blocked: true,
            lastActivityDate: true,
            uiLanguage: true,
          },
        },
      },
    });
    return accessToken ?? null;
  }

  async findByUserId(userId: string): Promise<AccessTokenData[]> {
    return this.databaseClient.authAccessToken.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
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
  }
}
