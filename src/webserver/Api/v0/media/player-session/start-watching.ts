import type express from 'express';
import Http2 from 'node:http2';
import { container } from 'tsyringe';
import { getPrismaClient } from '../../../../../Constants';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import WebServer from '../../../../WebServer';
import VideoSeekThumbnailControllerHelper from '../VideoSeekThumbnailControllerHelper';

const videoSeekThumbnailControllerHelper = container.resolve(VideoSeekThumbnailControllerHelper);

// TODO: Maybe we can refactor the whole request handling, as /change-media does something very similar?
export async function handleStartWatching(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  const releaseStartPlaybackLock = await videoSeekThumbnailControllerHelper.acquireStartPlaybackLockNonBlocking(playerSession);
  if (releaseStartPlaybackLock === false) {
    // TODO: wait for the lock instead
    res
      .status(423)
      .type('text/plain')
      .send('Another /change-media request is currently running for that PlayerSession – Try again in a couple of seconds');
    return;
  }

  try {
    const startOffset = parseUserInputInt(res, req.query?.startOffset, 0);
    if (startOffset == null) {
      return;
    }

    const mediaItemId = parseUserInputBigInt(res, req.query?.mediaItem);
    if (mediaItemId == null) {
      res
        .status(400)
        .type('text/plain')
        .send('Right now, only Media Library playback is supported (`mediaItem` parameter missing)');
      return;
    }

    const loggedInUser = WebServer.getUser(req);
    const mediaItem = await findMediaItem(mediaItemId, loggedInUser.id);

    if (mediaItem == null) {
      res
        .status(404)
        .type('text/plain')
        .send('The requested media file does not exist');
      return;
    }

    const apolloFile = loggedInUser.getDefaultFileSystem().getFile(mediaItem?.filePath);

    res.locals.timings?.startNext('start-transcode');
    await playerSession.startLiveTranscode(apolloFile, startOffset, {
      mediaItemId: mediaItem.id.toString(),
      title: mediaItem.media.title,
      episode: ((mediaItem.seasonNumber != null && mediaItem.episodeNumber != null) ? {
        title: mediaItem.title,
        season: mediaItem.seasonNumber,
        episode: mediaItem.episodeNumber,
      } : undefined),
    });
  } finally {
    releaseStartPlaybackLock();
  }

  res.locals.timings?.startNext('respond');
  res.redirect(Http2.constants.HTTP_STATUS_TEMPORARY_REDIRECT, '/media-new/watch');
}

// FIXME: Use LibraryManager or some kind of other abstraction with central/proper permission handling etc.
export async function findMediaItem(mediaItemId: bigint, expectedOwner: bigint): Promise<{
                                                                                           id: bigint,
                                                                                           filePath: string,
                                                                                           title: string,
                                                                                           episodeNumber: number | null,
                                                                                           seasonNumber: number | null,
                                                                                           media: {
                                                                                             title: string,
                                                                                           }
                                                                                         } | null> {
  const mediaItem = await getPrismaClient()!.mediaLibraryMediaItem.findUnique({
    where: { id: mediaItemId },
    select: {
      id: true,
      filePath: true,
      title: true,
      episodeNumber: true,
      seasonNumber: true,

      media: {
        select: {
          title: true,

          library: {
            select: {
              ownerId: true,
            },
          },
        },
      },
    },
  });

  if (mediaItem != null && mediaItem.media.library.ownerId !== expectedOwner) {
    throw new Error(`User ${expectedOwner.toString()} tried to request a media item he doesn't own`);
  }

  return mediaItem;
}

function parseUserInputInt(res: express.Response, userInput: unknown, defaultValue: number): number | null {
  if (userInput == null) {
    return defaultValue;
  }

  if (typeof userInput === 'string' && /^[0-9]+$/.test(userInput) && Number.isSafeInteger(parseInt(userInput, 10)) && parseInt(userInput, 10) >= 0) {
    return parseInt(userInput, 10);
  }

  // TODO: Can we have Svelte display an error page?
  res
    .status(400)
    .type('application/json')
    .send({ error: `Parameter 'startOffset' needs to be a positive integer` });
  return null;
}

function parseUserInputBigInt(res: express.Response, userInput: unknown): bigint | null {
  if (typeof userInput === 'bigint' && userInput >= 0n) {
    return userInput;
  }

  if (typeof userInput === 'string' && /^[0-9]+$/.test(userInput)) {
    return BigInt(userInput);
  }

  // TODO: Can we have Svelte display an error page?
  res
    .status(400)
    .type('application/json')
    .send({ error: `Parameter 'mediaItemId' needs to be a positive integer` });
  return null;
}
