import type express from 'express';
import Http2 from 'node:http2';
import { container } from 'tsyringe';
import MediaLibraryMediaFinder from '../../../../../media/library-new/MediaLibraryMedia/MediaLibraryMediaFinder';
import MediaLibraryMediaItem from '../../../../../media/library-new/MediaLibraryMediaItem/MediaLibraryMediaItem';
import MediaLibraryMediaItemFinder
  from '../../../../../media/library-new/MediaLibraryMediaItem/MediaLibraryMediaItemFinder';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import ApolloUser from '../../../../../user/ApolloUser';
import ApolloUserStorage from '../../../../../user/ApolloUserStorage';
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
    const mediaItem = await findMediaItem(mediaItemId, loggedInUser);

    if (mediaItem == null || !mediaItem.canRead(loggedInUser)) {
      res
        .status(404)
        .type('text/plain')
        .send('The requested media file does not exist or you do not have permission to read it');
      return;
    }

    const libraryMediaFinder = container.resolve(MediaLibraryMediaFinder);
    const libraryMediaItemFinder = container.resolve(MediaLibraryMediaItemFinder);

    const owningUser = await new ApolloUserStorage().findById(mediaItem.libraryOwnerId);
    if (owningUser == null) {
      throw new Error('The owning user of the MediaItem does not exist');  // TODO: show 404 page
    }

    const apolloFile = owningUser.getDefaultFileSystem().getFile(mediaItem.filePath);
    const surroundingMediaItems = await libraryMediaItemFinder.findSurroundingMediaItems(mediaItem.id, mediaItem.libraryMediaId);

    const libraryMedia = await libraryMediaFinder.find(mediaItem.libraryMediaId);
    if (libraryMedia == null) {
      throw new Error('Unable to find the LibraryMedia for the MediaItem (this should never happen)');
    }

    res.locals.timings?.startNext('start-transcode');
    await playerSession.startLiveTranscode(apolloFile, startOffset, {
      mediaItemId: mediaItem.id.toString(),
      title: libraryMedia.title,
      episode: ((mediaItem.seasonNumber != null && mediaItem.episodeNumber != null) ? {
        title: mediaItem.title,
        season: mediaItem.seasonNumber,
        episode: mediaItem.episodeNumber,

        nextMedia: surroundingMediaItems.next ? {
          mediaItemId: surroundingMediaItems.next.id.toString(),
          title: surroundingMediaItems.next.title,
          episode: {
            season: surroundingMediaItems.next.seasonNumber!,
            episode: surroundingMediaItems.next.episodeNumber!,
            title: surroundingMediaItems.next.title,
          },
        } : undefined,
        previousMedia: surroundingMediaItems.previous ? {
          mediaItemId: surroundingMediaItems.previous.id.toString(),
          title: surroundingMediaItems.previous.title,
          episode: {
            season: surroundingMediaItems.previous.seasonNumber!,
            episode: surroundingMediaItems.previous.episodeNumber!,
            title: surroundingMediaItems.previous.title,
          },
        } : undefined,
      } : undefined),
    });
  } finally {
    releaseStartPlaybackLock();
  }

  res.locals.timings?.startNext('respond');
  res.redirect(Http2.constants.HTTP_STATUS_TEMPORARY_REDIRECT, '/media-new/watch');
}

// FIXME: Use LibraryManager or some kind of other abstraction with central/proper permission handling etc.
export async function findMediaItem(mediaItemId: bigint, accessingUser: ApolloUser): Promise<MediaLibraryMediaItem | null> {
  const mediaItemFinder = container.resolve(MediaLibraryMediaItemFinder);
  const mediaItem = await mediaItemFinder.find(mediaItemId);

  if (mediaItem != null && !mediaItem.canRead(accessingUser)) {
    throw new Error('Media Item does not exist or you do not have permission to read it');  // TODO: show 404 page
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
