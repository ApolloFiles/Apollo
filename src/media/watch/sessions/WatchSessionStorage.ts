import Crypto from 'crypto';
import WatchSession from './WatchSession';

export default class WatchSessionStorage {
  private readonly sessions: Map<string, WatchSession> = new Map();

  constructor() {
    setInterval(() => this.cleanupStaleSessions(), 1000 * 60 * 30 /* 30 minutes */);
  }

  find(sessionId: string): WatchSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  create(): WatchSession {
    const sessionId = this.generateSessionId();
    const session = new WatchSession(sessionId);

    this.sessions.set(sessionId, session);
    return session;
  }

  private cleanupStaleSessions(): void {
    // TODO
    console.error('// TODO: Implement WatchSessionStorage#cleanupStaleSessions()');
  }

  private generateSessionId(): string {
    let sessionId;
    do {
      sessionId = Crypto.randomBytes(16).toString('hex');
    } while (this.sessions.has(sessionId));
    return sessionId;
  }
}
