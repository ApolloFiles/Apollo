import type express from 'express';
import Http2 from 'node:http2';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import Utils from '../../../../../Utils';
import type { StartPlaybackResponse } from './change-media';

export async function handlePlaybackStatus(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  const currentMedia = playerSession.getCurrentMedia();

  if (currentMedia == null) {
    // TODO: 404 feels wrong but maybe we want to send something else :/
    res
      .status(Http2.constants.HTTP_STATUS_NO_CONTENT)
      .send();
    return;
  }

  res
    .status(200)
    .type('application/json')
    .send({
      hlsManifest: `/api/v0/media/player-session/file/${Utils.encodeUriProperly(currentMedia.relativePublicPathToHlsManifest)}`,
      totalDurationInSeconds: currentMedia.totalDurationInSeconds,
      startOffsetInSeconds: currentMedia.startOffset,
      mediaMetadata: currentMedia.mediaMetadata,
    } satisfies StartPlaybackResponse);
}
