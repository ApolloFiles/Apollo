import type { AniDbBan } from '../transport/AniDbBanState.js';
import { AniDbError } from './AniDbError.js';

export class AniDbFloodControlError extends AniDbError {
  /** @internal */
  static createForExceededQueueWaitTime(estimatedWaitMs: number): AniDbFloodControlError {
    return new AniDbFloodControlError(
      `Refusing to contact the AniDB API because the queue is backed up by about ${Math.round(estimatedWaitMs / 1000)}s`,
    );
  }

  /** @internal */
  static createForActiveBan(ban: AniDbBan): AniDbFloodControlError {
    return new AniDbFloodControlError(
      `Refusing to contact the AniDB API until ${ban.bannedUntil.toISOString()}: ${ban.reason}`,
    );
  }

  /** @internal */
  static createForShutdown(): AniDbFloodControlError {
    return new AniDbFloodControlError('Cancelled the queued AniDB API request because the app is shutting down');
  }
}
