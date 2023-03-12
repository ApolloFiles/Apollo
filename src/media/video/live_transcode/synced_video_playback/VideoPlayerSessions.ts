import Crypto from 'crypto';
import IUserFile from '../../../../files/IUserFile';
import LiveTranscodeManifestGenerator from '../LiveTranscodeManifestGenerator';
import LiveTranscodeSession from './LiveTranscodeSession';

export type VideoPlayerSessionStorage = { [sessionId: string]: LiveTranscodeSession };

export default class VideoPlayerSessions {
  private readonly sessions: VideoPlayerSessionStorage = {};

  find(sessionId: string): LiveTranscodeSession | null {
    return this.sessions[sessionId] ?? null;
  }

  create(file: IUserFile, manifestGenerator: LiveTranscodeManifestGenerator): LiveTranscodeSession {
    const session = new LiveTranscodeSession(this.generateSessionId(), file, manifestGenerator);
    this.sessions[session.id] = session;
    return session;
  }

  findSessionForFile(file: IUserFile): LiveTranscodeSession | null {
    for (const sessionId in this.sessions) {
      if (this.sessions[sessionId].mediaFile.equals(file)) {
        return this.sessions[sessionId];
      }
    }

    return null;
  }

  private generateSessionId(): string {
    let sessionId;
    do {
      sessionId = Crypto.randomBytes(16).toString('hex');
    } while (this.find(sessionId) != null);
    return sessionId;
  }
}
