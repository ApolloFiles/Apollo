import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import type { Prisma } from '../../database/prisma-client/client.js';

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
  },
}

@singleton()
export default class AuthSessionFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findSession(token: string, transaction?: Prisma.TransactionClient): Promise<SessionDataWithUser | null> {
    const session = await (transaction ?? this.databaseClient).authSession.findUnique({
      where: {
        hashedToken: this.hashToken(token),
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

  private hashToken(token: string): Buffer<ArrayBuffer> {
    return Crypto.hash('sha256', Buffer.from(token, 'base64url'), { outputEncoding: 'buffer' });
  }
}
