import type express from 'express';
import { container } from 'tsyringe';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import Utils from '../../../../../Utils';
import VideoSeekThumbnailControllerHelper from '../VideoSeekThumbnailControllerHelper';

export type StartPlaybackResponse = {
  hlsManifest: string,
  totalDurationInSeconds: number,
  startOffsetInSeconds: number,
  mediaMetadata: {
    title: string,
    episode?: {
      season: number,
      episode: number,
      title: string,
    }
  },
}

const videoSeekThumbnailControllerHelper = container.resolve(VideoSeekThumbnailControllerHelper);

export async function handleStartPlayback(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  const startOffset = parseUserInputInt(res, req.body?.startOffset, 0);
  if (startOffset == null) {
    return;
  }

  const file = await videoSeekThumbnailControllerHelper.parseRequestedFile(req, res, req.body?.file);
  if (file == null) {
    return;
  }

  res.locals.timings?.startNext('start-transcode');
  const videoLiveTranscodeMedia = await playerSession.startLiveTranscode(file, startOffset);

  res.locals.timings?.startNext('respond');
  res
    .status(200)
    .type('application/json')
    .send({
      hlsManifest: `/api/v0/media/player-session/file/${Utils.encodeUriProperly(videoLiveTranscodeMedia.relativePublicPathToHlsManifest)}`,
      totalDurationInSeconds: videoLiveTranscodeMedia.totalDurationInSeconds,
      startOffsetInSeconds: startOffset,
      mediaMetadata: {
        title: playerSession.getCurrentFile()?.getFileName() ?? '', // TODO: provide a pretty name
      },
    } satisfies StartPlaybackResponse);
}

function parseUserInputInt(res: express.Response, userInput: unknown, defaultValue: number): number | null {
  if (userInput == null) {
    return defaultValue;
  }

  if (typeof userInput === 'number' && Number.isSafeInteger(userInput) && userInput >= 0) {
    return userInput;
  }

  res
    .status(400)
    .type('application/json')
    .send({ error: `Parameter 'startOffset' needs to be a positive integer` });
  return null;
}
