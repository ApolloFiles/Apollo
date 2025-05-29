import Utils from '../../../Utils';
import type VideoLiveTranscodeMedia from '../live-transcode/VideoLiveTranscodeMedia';
import type PlayerSession from '../player-session/PlayerSession';
import { MESSAGE_TYPE } from './WebSocketDataMessageType';
import type {
  ClockSyncMessage,
  MediaChangedMessage,
  ReferencePlayerChangedMessage,
  SessionInfoMessage,
  WebSocketMessage,
  WelcomeMessage,
} from './WebSocketMessages';

// TODO: Können wir die keys in der Message noch kürzen irgendwie?
// TODO: Können wir statt "JSON Object" ein Array schicken mit [typeId, data]? Spart bestimmt auch 4free bissl?

export default class WebSocketMessageBuilder {
  static buildWelcome(connectionId: number, userId: string): string {
    return this.asString({
      type: MESSAGE_TYPE.WELCOME,
      data: {
        connectionId,
        userId,
        serverTime: Date.now(),
      },
    } satisfies WelcomeMessage);
  }

  static buildSessionInfo(playerSession: PlayerSession): string {
    return this.asString({
      type: MESSAGE_TYPE.SESSION_INFO,
      data: {
        id: playerSession.id,
        participants: {
          total: playerSession.participants.length + 1,
          owner: {
            id: playerSession.owner.id.toString(),
            displayName: playerSession.owner.displayName,
            connected: playerSession.ownerConnected,
          },
          otherParticipants: playerSession.participants,
        },
      },
    } satisfies SessionInfoMessage);
  }

  static buildMediaChanged(sessionId: string, media: VideoLiveTranscodeMedia | null): string {
    if (media == null) {
      return this.asString({
        type: MESSAGE_TYPE.MEDIA_CHANGED,
        data: { media: null },
      } satisfies MediaChangedMessage);
    }

    return this.asString({
      type: MESSAGE_TYPE.MEDIA_CHANGED,
      data: {
        media: {
          hlsManifest: `/api/v0/media/player-session/${encodeURIComponent(sessionId)}/file/${Utils.encodeUriProperly(media.relativePublicPathToHlsManifest)}`,
          totalDurationInSeconds: media.totalDurationInSeconds,
          startOffsetInSeconds: media.startOffset,
          mediaMetadata: media.mediaMetadata,
        },
      },
    } satisfies MediaChangedMessage);
  }

  static buildReferencePlayerChanged(connectionId: number, userId: string): string {
    return this.asString({
      type: MESSAGE_TYPE.REFERENCE_PLAYER_CHANGED,
      data: {
        connectionId,
        userId,
      },
    } satisfies ReferencePlayerChangedMessage);
  }

  static buildClockSync(serverTime: number): string {
    return this.asString({
      type: MESSAGE_TYPE.CLOCK_SYNC,
      data: {
        serverTime,
      },
    } satisfies ClockSyncMessage);
  }

  private static asString(data: WebSocketMessage): string {
    return JSON.stringify(data);
  }
}
