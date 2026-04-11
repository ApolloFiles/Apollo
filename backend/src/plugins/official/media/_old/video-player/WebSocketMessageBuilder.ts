// TODO: Können wir die keys in der Message noch kürzen irgendwie?
// TODO: Können wir statt "JSON Object" ein Array schicken mit [typeId, data]? Spart bestimmt auch 4free bissl?

import { MESSAGE_TYPE, type ClockSyncMessage, type MediaChangedMessage,
  type ReferencePlayerChangedMessage, type SessionInfoMessage, type WebSocketMessage, type WelcomeMessage } from './legacy-types.js';
import type VideoLiveTranscodeMedia from './live-transcode/VideoLiveTranscodeMedia.js';
import type PlayerSession from './player-session/PlayerSession.js';

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

  static buildMediaChanged(sessionId: string, media: VideoLiveTranscodeMedia | null, youTubeMedia?: { videoId: string; startSeconds?: number; title: string } | null): string {
    if (youTubeMedia != null) {
      return this.asString({
        type: MESSAGE_TYPE.MEDIA_CHANGED,
        data: {
          media: {
            type: 'youtube',
            videoId: youTubeMedia.videoId,
            startSeconds: youTubeMedia.startSeconds,
            title: youTubeMedia.title,
          },
        },
      } satisfies MediaChangedMessage);
    }

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
          type: 'live-transcode',
          hlsManifest: `/api/_frontend/media/player-session/${encodeURIComponent(sessionId)}/file/${this.encodeUriProperly(media.relativePublicPathToHlsManifest)}`,
          totalDurationInSeconds: media.totalDurationInSeconds,
          startOffsetInSeconds: media.startOffset,
          mediaMetadata: media.mediaMetadata,

          additionalStreams: {
            subtitles: media.subtitleMetadata.subtitles.map(stream => ({
              title: stream.title,
              language: stream.language,
              codecName: stream.codecName,
              uri: `/api/_frontend/media/player-session/${encodeURIComponent(sessionId)}/file/${this.encodeUriProperly(stream.uri)}`,
              fonts: media.subtitleMetadata.fonts.map(font => ({
                uri: `/api/_frontend/media/player-session/${encodeURIComponent(sessionId)}/file/${this.encodeUriProperly(font.uri)}`,
              })),
            })),
          },
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

  private static encodeUriProperly(uri: string): string {
    return uri.split('/')
      .map(encodeURIComponent)
      .join('/');
  }
}
