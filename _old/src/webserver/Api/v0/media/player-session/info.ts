import type express from 'express';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import Utils from '../../../../../Utils';
import type { StartPlaybackResponse } from './change-media';

export type PlayerSessionInfoResponse = {
  session: {
    id: string,
    yourId: string,
    participants: {
      total: number,
      owner: { id: string, displayName: string, connected: boolean },
      otherParticipants: { id: string, displayName: string, connected: boolean }[],
    }
  },
  playbackStatus: StartPlaybackResponse | null
}

export async function handleInfo(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  const currentMedia = playerSession.getCurrentMedia();

  res
    .status(200)
    .type('application/json')
    .send({
      session: {
        id: playerSession.id,
        yourId: '',
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
      playbackStatus: currentMedia != null ? {
        hlsManifest: `/api/v0/media/player-session/${encodeURIComponent(playerSession.id)}/file/${Utils.encodeUriProperly(currentMedia.relativePublicPathToHlsManifest)}`,
        totalDurationInSeconds: currentMedia.totalDurationInSeconds,
        startOffsetInSeconds: currentMedia.startOffset,
        mediaMetadata: currentMedia.mediaMetadata,

        additionalStreams: {
          subtitles: currentMedia.subtitleMetadata.subtitles.map(stream => ({
            title: stream.title,
            language: stream.language,
            codecName: stream.codecName,
            uri: `/api/v0/media/player-session/${encodeURIComponent(playerSession.id)}/file/${Utils.encodeUriProperly(stream.uri)}`,
            fonts: currentMedia.subtitleMetadata.fonts.map(font => ({
              uri: `/api/v0/media/player-session/${encodeURIComponent(playerSession.id)}/file/${Utils.encodeUriProperly(font.uri)}`,
            })),
          })),
        },
      } : null,
    } satisfies PlayerSessionInfoResponse);
}
