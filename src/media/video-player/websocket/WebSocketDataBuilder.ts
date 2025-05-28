import Utils from '../../../Utils';
import { StartPlaybackResponse } from '../../../webserver/Api/v0/media/player-session/change-media';
import { PlayerSessionInfoResponse } from '../../../webserver/Api/v0/media/player-session/info';
import VideoLiveTranscodeMedia from '../live-transcode/VideoLiveTranscodeMedia';
import PlayerSession from '../player-session/PlayerSession';
import { MESSAGE_TYPE } from './WebSocketDataMessageType';

// TODO: Können wir die keys in der Message noch kürzen irgendwie?
// TODO: Können wir statt "JSON Object" ein Array schicken mit [typeId, data]? Spart bestimmt auch 4free bissl?

export type WebSocketMessage = {
  type: MESSAGE_TYPE;
  data: Record<string, unknown>;
}

export interface SessionInfoMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.SESSION_INFO,
  data: PlayerSessionInfoResponse['session']
}

export interface MediaChangedMessage extends WebSocketMessage {
  type: MESSAGE_TYPE.MEDIA_CHANGED,
  data: {
    media: StartPlaybackResponse | null,
  };
}

export default class WebSocketDataBuilder {
  static buildSessionInfo(playerSession: PlayerSession, clientId: string): string {
    return this.asString({
      type: MESSAGE_TYPE.SESSION_INFO,
      data: {
        id: playerSession.id,
        yourId: clientId,
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

  static buildMediaChanged(media: VideoLiveTranscodeMedia | null): string {
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
          hlsManifest: `/api/v0/media/player-session/file/${Utils.encodeUriProperly(media.relativePublicPathToHlsManifest)}`,
          totalDurationInSeconds: media.totalDurationInSeconds,
          startOffsetInSeconds: media.startOffset,
          mediaMetadata: media.mediaMetadata,
        },
      },
    } satisfies MediaChangedMessage);
  }

  private static asString(data: Record<string, unknown>): string {
    return JSON.stringify(data);
  }
}
