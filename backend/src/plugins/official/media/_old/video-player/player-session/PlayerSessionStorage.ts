import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import PlayerSession from './PlayerSession.js';

@singleton()
export default class PlayerSessionStorage {
  private readonly sessionIdSalt = Crypto.randomBytes(16).toString('hex');
  private readonly sessions: Map<string, PlayerSession> = new Map();

  findById(sessionId: string): PlayerSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  findByJoinToken(joinToken: string): PlayerSession | null {
    for (const session of this.sessions.values()) {
      if (session.joinToken?.token === joinToken) {
        return session;
      }
    }
    return null;
  }

  findOrCreateBySessionCookie(user: ApolloUser, sessionCookieValue: string): PlayerSession {
    const sessionId = this.generatePlayerSessionIdBySessionCookie(sessionCookieValue);

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new PlayerSession(sessionId, user));
    }
    return this.sessions.get(sessionId)!;
  }

  private generatePlayerSessionIdBySessionCookie(sessionCookieValue: string): string {
    return Crypto
      .createHash('sha1')
      .update(this.sessionIdSalt)
      .update(sessionCookieValue)
      .digest('hex');
  }
}
