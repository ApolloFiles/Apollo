import type express from 'express';
import { container } from 'tsyringe';
import VideoLiveTranscodeMedia from '../../../../../media/video-player/live-transcode/VideoLiveTranscodeMedia';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import Utils from '../../../../../Utils';
import WebServer from '../../../../WebServer';
import VideoSeekThumbnailControllerHelper from '../VideoSeekThumbnailControllerHelper';
import { findMediaItem, findNextMediaItem, findPreviousMediaItem } from './start-watching';

export type StartPlaybackResponse = {
  hlsManifest: string,
  totalDurationInSeconds: number,
  startOffsetInSeconds: number,
  mediaMetadata: {
    mediaItemId: string,
    title: string,
    episode?: {
      season: number,
      episode: number,
      title: string,

      nextMedia?: {
        mediaItemId: string,
        title: string,
        episode: {
          season: number,
          episode: number,
          title: string,
        },
      },
      previousMedia?: {
        mediaItemId: string,
        title: string,
        episode: {
          season: number,
          episode: number,
          title: string,
        },
      },
    }
  },
}

const videoSeekThumbnailControllerHelper = container.resolve(VideoSeekThumbnailControllerHelper);

export async function handleChangeMedia(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  const releaseStartPlaybackLock = await videoSeekThumbnailControllerHelper.acquireStartPlaybackLockNonBlocking(playerSession);
  if (releaseStartPlaybackLock === false) {
    res
      .status(423)
      .type('application/json')
      .send({
        error: 'Another /change-media request is currently running for that PlayerSession – Try again in a couple of seconds',
      });
    return;
  }

  let videoLiveTranscodeMedia: VideoLiveTranscodeMedia;

  try {
    const startOffset = parseUserInputInt(res, req.body?.startOffset, 0);
    if (startOffset == null) {
      return;
    }

    const mediaItemId = parseUserInputBigInt(req.body?.mediaItemId, 0n);
    if (mediaItemId > 0) {
      const loggedInUser = WebServer.getUser(req);
      const mediaItem = await findMediaItem(mediaItemId, loggedInUser.id);
      if (mediaItem == null) {
        return;
      }

      const nextMediaItem = (mediaItem.episodeNumber != null && mediaItem.seasonNumber != null) ?
        await findNextMediaItem(mediaItem.mediaId, mediaItem.episodeNumber, mediaItem.seasonNumber, loggedInUser.id)
        : null;
      const previousMediaItem = (mediaItem.episodeNumber != null && mediaItem.seasonNumber != null) ?
        await findPreviousMediaItem(mediaItem.mediaId, mediaItem.episodeNumber, mediaItem.seasonNumber, loggedInUser.id)
        : null;

      res.locals.timings?.startNext('start-transcode');
      videoLiveTranscodeMedia = await playerSession.startLiveTranscode(loggedInUser.getDefaultFileSystem().getFile(mediaItem.filePath), startOffset, {
        mediaItemId: mediaItemId.toString(),
        title: mediaItem.title,
        episode: ((mediaItem.seasonNumber != null && mediaItem.episodeNumber != null) ? {
          title: mediaItem.title,
          season: mediaItem.seasonNumber,
          episode: mediaItem.episodeNumber,

          nextMedia: nextMediaItem ? {
            mediaItemId: nextMediaItem.id.toString(),
            title: nextMediaItem.title,
            episode: {
              season: nextMediaItem.seasonNumber,
              episode: nextMediaItem.episodeNumber,
              title: nextMediaItem.title,
            },
          } : undefined,
          previousMedia: previousMediaItem ? {
            mediaItemId: previousMediaItem.id.toString(),
            title: previousMediaItem.title,
            episode: {
              season: previousMediaItem.seasonNumber,
              episode: previousMediaItem.episodeNumber,
              title: previousMediaItem.title,
            },
          } : undefined,
        } : undefined),
      });
    } else {
      const file = await videoSeekThumbnailControllerHelper.parseRequestedFile(req, res, req.body?.file);
      if (file == null) {
        return;
      }

      res.locals.timings?.startNext('start-transcode');
      videoLiveTranscodeMedia = await playerSession.startLiveTranscode(file, startOffset, {
        mediaItemId: '0', // FIXME
        title: file.getFileName(),
      });
    }
  } finally {
    releaseStartPlaybackLock();
  }

  res.locals.timings?.startNext('respond');
  res
    .status(200)
    .type('application/json')
    .send({
      hlsManifest: `/api/v0/media/player-session/${encodeURIComponent(playerSession.id)}/file/${Utils.encodeUriProperly(videoLiveTranscodeMedia.relativePublicPathToHlsManifest)}`,
      totalDurationInSeconds: videoLiveTranscodeMedia.totalDurationInSeconds,
      startOffsetInSeconds: videoLiveTranscodeMedia.startOffset,
      mediaMetadata: videoLiveTranscodeMedia.mediaMetadata,
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

function parseUserInputBigInt(userInput: unknown, defaultValue: bigint): bigint {
  if (typeof userInput === 'bigint' && userInput >= 0n) {
    return userInput;
  }
  if (typeof userInput === 'number' && userInput >= 0) {
    return BigInt(userInput);
  }

  if (typeof userInput === 'string' && /^[0-9]+$/.test(userInput) && BigInt(userInput) >= 0) {
    return BigInt(userInput);
  }

  return defaultValue;
}
