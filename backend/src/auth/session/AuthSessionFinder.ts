import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import type { Prisma } from '../../database/prisma-client/client.js';
import SecureTokenHelper from '../SecureTokenHelper.js';

export type SessionData = {
  id: bigint,
  createdAt: Date,
  expiresAt: Date,
  roughLastActivity: Date,
}

export type SessionDataWithUser = SessionData & {
  user: {
    id: string,
    displayName: string,
    isSuperUser: boolean,
    blocked: boolean,
    lastActivityDate: Date | null,
  },
}

@singleton()
export default class AuthSessionFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  async findSession(token: string, transaction?: Prisma.TransactionClient): Promise<SessionDataWithUser | null> {
    const session = await (transaction ?? this.databaseClient).authSession.findUnique({
      where: {
        hashedToken: this.secureTokenHelper.hashToken(token),
        expiresAt: { gt: await this.databaseClient.fetchNow() },
        user: {
          // Sessions for blocked users are invalid
          blocked: false,
        },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        roughLastActivity: true,
        user: {
          select: {
            id: true,
            displayName: true,
            isSuperUser: true,
            blocked: true,
            lastActivityDate: true,
          },
        },
      },
    });
    return session ?? null;
  }

  async findByUserId(userId: string): Promise<(SessionData & { userAgent: string })[]> {
    return this.databaseClient.authSession.findMany({
      where: {
        userId,
        expiresAt: { gt: await this.databaseClient.fetchNow() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        roughLastActivity: true,
        userAgent: true,
      },
    });
  }
}
