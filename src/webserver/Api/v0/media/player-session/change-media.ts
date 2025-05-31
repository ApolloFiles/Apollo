import type express from 'express';
import { container } from 'tsyringe';
import MediaLibraryMediaFinder from '../../../../../media/library-new/MediaLibraryMedia/MediaLibraryMediaFinder';
import MediaLibraryMediaItemFinder
  from '../../../../../media/library-new/MediaLibraryMediaItem/MediaLibraryMediaItemFinder';
import VideoLiveTranscodeMedia from '../../../../../media/video-player/live-transcode/VideoLiveTranscodeMedia';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import ApolloUserStorage from '../../../../../user/ApolloUserStorage';
import Utils from '../../../../../Utils';
import WebServer from '../../../../WebServer';
import VideoSeekThumbnailControllerHelper from '../VideoSeekThumbnailControllerHelper';
import { findMediaItem } from './start-watching';

// TODO: Maybe rename? It's not really the whole playback stuff but only limited to media
// FIXME: Limited to LiveTranscode right now
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
  // TODO: Make additionalStreams optional (or all its keys)
  additionalStreams: {
    subtitles: {
      title: string,
      language: string,
      codecName: string,
      uri: string,
      fonts: { uri: string }[]
    }[]
  }
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
      const mediaItem = await findMediaItem(mediaItemId, loggedInUser);
      if (mediaItem == null) {
        return;
      }
      if (!mediaItem.canRead(loggedInUser)) {
        throw new Error('The requested media file does not exist or you do not have permission to read it');
      }

      const libraryMediaFinder = container.resolve(MediaLibraryMediaFinder);
      const libraryMediaItemFinder = container.resolve(MediaLibraryMediaItemFinder);

      const libraryMedia = await libraryMediaFinder.find(mediaItem.libraryMediaId);
      if (libraryMedia == null) {
        throw new Error('Unable to find the LibraryMedia for the MediaItem (this should never happen)');
      }

      const surroundingMediaItems = await libraryMediaItemFinder.findSurroundingMediaItems(mediaItem.id, mediaItem.libraryMediaId);


      const owningUser = await new ApolloUserStorage().findById(mediaItem.libraryOwnerId);
      if (owningUser == null) {
        throw new Error('The owning user of the MediaItem does not exist');  // TODO: show 404 page
      }

      res.locals.timings?.startNext('start-transcode');
      videoLiveTranscodeMedia = await playerSession.startLiveTranscode(owningUser.getDefaultFileSystem().getFile(mediaItem.filePath), startOffset, {
        mediaItemId: mediaItemId.toString(),
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

      additionalStreams: {
        subtitles: videoLiveTranscodeMedia.subtitleMetadata.subtitles.map(stream => ({
          title: stream.title,
          language: stream.language,
          codecName: stream.codecName,
          uri: `/api/v0/media/player-session/${encodeURIComponent(playerSession.id)}/file/${Utils.encodeUriProperly(stream.uri)}`,
          fonts: videoLiveTranscodeMedia.subtitleMetadata.fonts.map(font => ({
            uri: `/api/v0/media/player-session/${encodeURIComponent(playerSession.id)}/file/${Utils.encodeUriProperly(font.uri)}`,
          })),
        })),
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
