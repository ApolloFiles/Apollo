import type { FastifyReply, FastifyRequest } from 'fastify';
import Fs from 'node:fs';
import Http2 from 'node:http2';
import Path from 'node:path';
import rangeParser from 'range-parser';
import { injectable } from 'tsyringe';
import { z } from 'zod';
import AppConfiguration from '../../../../../../config/AppConfiguration.js';
import { ContainerTokens } from '../../../../../../constants.js';
import FileSystemProvider from '../../../../../../files/FileSystemProvider.js';
import LocalFileSystem from '../../../../../../files/local/LocalFileSystem.js';
import FileTypeUtils from '../../../../../../plugins/official/media/_old/FileTypeUtils.js';
import LibraryManager from '../../../../../../plugins/official/media/_old/libraries/LibraryManager.js';
import {
  default as MediaLibraryMediaItemFinderOld,
} from '../../../../../../plugins/official/media/_old/library/MediaLibraryMediaItem/MediaLibraryMediaItemFinder.js';
import type {
  PlayerSessionInfoResponse,
  RegenerateJoinTokenResponse,
  StartPlaybackResponse,
  TwitchMediaInfo,
  YouTubeMediaInfo,
} from '../../../../../../plugins/official/media/_old/video-player/legacy-types.js';
import type VideoLiveTranscodeMedia
  from '../../../../../../plugins/official/media/_old/video-player/live-transcode/VideoLiveTranscodeMedia.js';
import type PlayerSession
  from '../../../../../../plugins/official/media/_old/video-player/player-session/PlayerSession.js';
import PlayerSessionStorage
  from '../../../../../../plugins/official/media/_old/video-player/player-session/PlayerSessionStorage.js';
import SeekThumbnailProvider
  from '../../../../../../plugins/official/media/_old/video-player/seek-thumbnails/SeekThumbnailProvider.js';
import VideoSeekThumbnailControllerHelper
  from '../../../../../../plugins/official/media/_old/video-player/seek-thumbnails/VideoSeekThumbnailControllerHelper.js';
import {
  default as MediaLibraryMediaItemFinderNew,
} from '../../../../../../plugins/official/media/library/database/media-item/MediaLibraryMediaItemFinder.js';
import PermissionAwareLibraryMediaItemProvider
  from '../../../../../../plugins/official/media/library/permission-aware/PermissionAwareLibraryMediaItemProvider.js';
import PermissionAwareLibraryMediaProvider
  from '../../../../../../plugins/official/media/library/permission-aware/PermissionAwareLibraryMediaProvider.js';
import ReadContentsAwareLibraryMediaItem
  from '../../../../../../plugins/official/media/library/permission-aware/ReadContentsAwareLibraryMediaItem.js';
import ApolloFileURI from '../../../../../../uri/ApolloFileURI.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import UserProvider from '../../../../../../user/UserProvider.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

// TODO: Refactor this
@injectable({ token: ContainerTokens.ROUTER })
export default class PlayerSessionRouter implements Router {
  constructor(
    private readonly appConfiguration: AppConfiguration,
    private readonly userProvider: UserProvider,
    private readonly playerSessionStorage: PlayerSessionStorage,
    private readonly videoSeekThumbnailControllerHelper: VideoSeekThumbnailControllerHelper,
    private readonly libraryMediaItemFinder_old: MediaLibraryMediaItemFinderOld,
    private readonly libraryMediaItemFinder_new: MediaLibraryMediaItemFinderNew,
    private readonly permissionAwareLibraryMediaProvider: PermissionAwareLibraryMediaProvider,
    private readonly permissionAwareLibraryMediaItemProvider: PermissionAwareLibraryMediaItemProvider,
    private readonly fileSystemProvider: FileSystemProvider,
    private readonly fileTypeUtils: FileTypeUtils,
    private readonly seekThumbnailProvider: SeekThumbnailProvider,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/media/player-session';
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/info', async (request, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionByQueryParamOrSessionCookie(request, reply, apolloUser);
      if (playerSession == null) {
        return reply;
      }

      const currentMedia = playerSession.getCurrentMedia();
      const currentYouTubeMedia = playerSession.getCurrentYouTubeMedia();
      const currentTwitchMedia = playerSession.getCurrentTwitchMedia();

      return reply
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
          playbackStatus: currentTwitchMedia != null ? ({
            type: 'twitch',
            channelName: currentTwitchMedia.channelName,
            title: currentTwitchMedia.title,
          } satisfies TwitchMediaInfo) : currentYouTubeMedia != null ? ({
            type: 'youtube',
            videoId: currentYouTubeMedia.videoId,
            startSeconds: currentYouTubeMedia.startSeconds,
            title: currentYouTubeMedia.title,
          } satisfies YouTubeMediaInfo) : currentMedia != null ? ({
            type: 'live-transcode',
            hlsManifest: `/api/_frontend/media/player-session/${encodeURIComponent(playerSession.id)}/file/${this.encodeUriProperly(currentMedia.relativePublicPathToHlsManifest)}`,
            totalDurationInSeconds: currentMedia.totalDurationInSeconds,
            startOffsetInSeconds: currentMedia.startOffset,
            mediaMetadata: currentMedia.mediaMetadata,

            additionalStreams: {
              subtitles: currentMedia.subtitleMetadata.subtitles.map(stream => ({
                title: stream.title,
                language: stream.language,
                codecName: stream.codecName,
                uri: `/api/_frontend/media/player-session/${encodeURIComponent(playerSession.id)}/file/${this.encodeUriProperly(stream.uri)}`,
                fonts: currentMedia.subtitleMetadata.fonts.map(font => ({
                  uri: `/api/_frontend/media/player-session/${encodeURIComponent(playerSession.id)}/file/${this.encodeUriProperly(font.uri)}`,
                })),
              })),
            },
          } satisfies StartPlaybackResponse) : null,
        } satisfies PlayerSessionInfoResponse);
    });

    server.get('/join', {
      schema: {
        querystring: z.object({
          token: z.string(),
        }),
      },
    }, async (request, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const joinTokenInput = request.query.token;

      const playerSession = this.playerSessionStorage.findByJoinToken(joinTokenInput);
      if (playerSession == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send('Player session not found or join token is invalid');
      }

      playerSession.addParticipant(apolloUser);
      return reply.redirect(`/media/watch?session=${encodeURIComponent(playerSession.id)}`, Http2.constants.HTTP_STATUS_TEMPORARY_REDIRECT);
    });

    server.get('/start-watching', {
      schema: {
        querystring: z.object({
          mediaItem: z.coerce.bigint().positive(),
          startOffset: z.string().regex(/^(?:[0-9]+|auto)$/),
        }),
      },
    }, async (request, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionByQueryParamOrSessionCookie(request, reply, apolloUser);
      if (playerSession == null) {
        return reply;
      }

      const releaseStartPlaybackLock = await this.videoSeekThumbnailControllerHelper.acquireStartPlaybackLockNonBlocking(playerSession);
      if (releaseStartPlaybackLock === false) {
        // TODO: wait for the lock instead
        return reply
          .status(423)
          .type('text/plain')
          .send('Another /change-media request is currently running for that PlayerSession – Try again in a couple of seconds');
      }

      try {
        const mediaItemId = this.parseUserInputBigInt(request.query.mediaItem, 0n);
        if (mediaItemId == null || mediaItemId <= 0n) {
          return reply
            .status(400)
            .type('text/plain')
            .send('Right now, only Media Library playback is supported (`mediaItem` parameter missing)');
        }

        const mediaItem = await this.findMediaItem(mediaItemId, apolloUser);

        let startOffset: number | null = null;

        if (request.query.startOffset === 'auto') {
          const watchProgress = await (await new LibraryManager(apolloUser).getLibrary(mediaItem.mediaItem.libraryId.toString()))!.fetchMediaWatchProgressInSeconds(mediaItemId);
          startOffset = watchProgress ?? 0;
        }

        if (startOffset == null) {
          startOffset = this.parseUserInputInt(reply, request.query.startOffset, 0);
          if (startOffset == null) {
            return reply;
          }
        }

        const owningUser = await this.userProvider.findById(mediaItem.mediaItem.libraryOwnerId);
        if (owningUser == null) {
          throw new Error('The owning user of the MediaItem does not exist');  // TODO: show 404 page
        }

        const fileSystems = await this.fileSystemProvider.provideForUser(owningUser);
        const owningUserDefaultFileSystem = fileSystems.user[0];
        if (!(owningUserDefaultFileSystem instanceof LocalFileSystem)) {
          return reply
            .status(501)
            .send({ error: `The requested file is not stored in the local file system (Missing implementation)` });
        }

        const fullMediaItem = await this.libraryMediaItemFinder_new.findFullById(mediaItem.mediaItem.id);
        const apolloFile = owningUserDefaultFileSystem.getFile(Path.join(fullMediaItem!.mediaBaseDirectoryUri.filePath, fullMediaItem!.relativeFilePath));
        const surroundingMediaItems = await this.libraryMediaItemFinder_old.findSurroundingMediaItems(mediaItem.mediaItem.id, mediaItem.mediaItem.mediaId);

        const libraryMedia = await this.permissionAwareLibraryMediaProvider.provideForReadContents(mediaItem.mediaItem.mediaId, apolloUser);

        await playerSession.startLiveTranscode(apolloFile, startOffset, {
          mediaItemId: mediaItem.mediaItem.id.toString(),
          title: libraryMedia.media.title,
          episode: ((mediaItem.mediaItem.seasonNumber != null && mediaItem.mediaItem.episodeNumber != null) ? {
            title: mediaItem.mediaItem.title,
            season: mediaItem.mediaItem.seasonNumber,
            episode: mediaItem.mediaItem.episodeNumber,

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

      return reply.redirect('/media/watch', Http2.constants.HTTP_STATUS_TEMPORARY_REDIRECT);
    });

    server.get('/:sessionId/file/*', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession == null) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found');
      }
//      if (playerSession?.owner.id !== apolloUser.id) {
//        return reply
//          .status(403)
//          .type('text/plain')
//          .send('Session not found or you are not the owner of this session');
//      }

      let requestedFilePath = new URL(request.url, 'https://localhost').pathname;
      requestedFilePath = requestedFilePath.substring(requestedFilePath.indexOf('/file/') + 6);

      const requestedFilePathOnHost = Path.join(playerSession.tmpDir.publicSubDirPath, requestedFilePath);
      if (!requestedFilePathOnHost.startsWith(playerSession.tmpDir.publicSubDirPath)) {
        return reply
          .status(403)
          .send('Forbidden');
      }

      if (!(await this.fileExists(requestedFilePathOnHost))) {
        return reply
          .status(404)
          .send('Requested file not found');
      }

      const currentMedia = playerSession.getCurrentMedia();
      if (currentMedia != null) {
        const liveTranscodeManifestPathOnHost = Path.join(playerSession.tmpDir.publicSubDirPath, currentMedia.relativePublicPathToHlsManifest);
        if (requestedFilePathOnHost === liveTranscodeManifestPathOnHost) {
          let liveTranscodeManifest = await Fs.promises.readFile(liveTranscodeManifestPathOnHost, 'utf-8');

          const audioStreamPrefix = `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME=`;
          for (const [streamName, displayName] of currentMedia.audioStreamNames.entries()) {
            const currentSubstring = `${audioStreamPrefix}${JSON.stringify(streamName)},`;
            const newSubstring = `${audioStreamPrefix}${JSON.stringify(displayName)},`;

            liveTranscodeManifest = liveTranscodeManifest.replace(currentSubstring, newSubstring);
          }

          return reply
            .status(200)
            .type('application/vnd.apple.mpegurl')
            .send(liveTranscodeManifest);
        }
      }

      const mimeType = await this.fileTypeUtils.getMimeTypeTrustExtension(requestedFilePathOnHost);
      await this.sendFileRespectingRequestedRange(request, reply, requestedFilePathOnHost, mimeType ?? 'application/octet-stream');
      return reply;
    });

    server.get('/:sessionId/video-seek-thumbnails', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession == null || !playerSession.checkAccessForUser(apolloUser)) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found or you do not have access to it');
      }

      const currentFile = playerSession.getCurrentMedia()?.sourceFile;
      if (currentFile != null) {
        (request.query as any).file = ApolloFileURI.create(currentFile.fileSystem.getOwnerOrThrow().id, currentFile.fileSystem.id, currentFile.path).toString();
      }

      const inputs = await this.videoSeekThumbnailControllerHelper.parseRequestFileAndThumbnailIndex(request, reply, apolloUser);
      if (inputs == null) {
        return reply;
      }

      let responseBody: string | Buffer;

      const releaseGenerationLock = await this.videoSeekThumbnailControllerHelper.acquireGenerationLock(ApolloFileURI.create(inputs.file.fileSystem.getOwnerOrThrow().id, inputs.file.fileSystem.id, inputs.file.path)); // acquire lock before any further async operations
      try {
        if (inputs.thumbnailIndex === -1) {
          const parsedOriginalRequestUrl = new URL(request.originalUrl, 'https://localhost');

          responseBody = await this.seekThumbnailProvider.provideWebVtt(
            inputs.file,
            (thumbnailIndex) => {
              parsedOriginalRequestUrl.searchParams.set('index', thumbnailIndex.toString());
              return parsedOriginalRequestUrl.pathname + parsedOriginalRequestUrl.search;
            },
          );
        } else {
          const thumbnailBytes = await this.seekThumbnailProvider.provideThumbnailImage(inputs.file, inputs.thumbnailIndex);
          if (thumbnailBytes == null) {
            return reply
              .status(404)
              .type('application/json')
              .send({ error: 'The requested thumbnail file does not exist' });
          }

          responseBody = thumbnailBytes;
        }
      } finally {
        releaseGenerationLock();
      }

      return reply
        .status(200)
        .type(inputs.thumbnailIndex === -1 ? 'text/vtt' : 'image/jpeg')
        .header('Cache-Control', 'private, no-cache')
        .send(responseBody);
    });

    server.post('/:sessionId/change-media', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession == null) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found');
      }
//      if (playerSession?.owner.id !== apolloUser.id) {
//        return reply
//          .status(403)
//          .type('text/plain')
//          .send('Session not found or you are not the owner of this session');
//      }

      const releaseStartPlaybackLock = await this.videoSeekThumbnailControllerHelper.acquireStartPlaybackLockNonBlocking(playerSession);
      if (releaseStartPlaybackLock === false) {
        return reply
          .status(423)
          .type('application/json')
          .send({
            error: 'Another /change-media request is currently running for that PlayerSession – Try again in a couple of seconds',
          });
      }

      let videoLiveTranscodeMedia: VideoLiveTranscodeMedia;

      try {
        const startOffset = this.parseUserInputInt(reply, (request.body as any)?.startOffset, 0);
        if (startOffset == null) {
          return reply;
        }

        const mediaItemId = this.parseUserInputBigInt((request.body as any)?.mediaItemId, 0n);
        if (mediaItemId > 0) {
          const mediaItem = await this.findMediaItem(mediaItemId, apolloUser);

          const libraryMedia = await this.permissionAwareLibraryMediaProvider.provideForReadContents(mediaItem.mediaItem.mediaId, apolloUser);

          const surroundingMediaItems = await this.libraryMediaItemFinder_old.findSurroundingMediaItems(mediaItem.mediaItem.id, mediaItem.mediaItem.mediaId);

          const owningUser = await this.userProvider.findById(mediaItem.mediaItem.libraryOwnerId);
          if (owningUser == null) {
            throw new Error('The owning user of the MediaItem does not exist');  // TODO: show 404 page
          }

          const fileSystems = await this.fileSystemProvider.provideForUser(owningUser);
          const owningUserDefaultFileSystem = fileSystems.user[0];
          if (!(owningUserDefaultFileSystem instanceof LocalFileSystem)) {
            return reply
              .status(501)
              .send({ error: `The requested file is not stored in the local file system (Missing implementation)` });
          }

          const fullMediaItem = await this.libraryMediaItemFinder_new.findFullById(mediaItem.mediaItem.id);
          videoLiveTranscodeMedia = await playerSession.startLiveTranscode(owningUserDefaultFileSystem.getFile(Path.join(fullMediaItem!.mediaBaseDirectoryUri.filePath, fullMediaItem!.relativeFilePath)), startOffset, {
            mediaItemId: mediaItemId.toString(),
            title: libraryMedia.media.title,
            episode: ((mediaItem.mediaItem.seasonNumber != null && mediaItem.mediaItem.episodeNumber != null) ? {
              title: mediaItem.mediaItem.title,
              season: mediaItem.mediaItem.seasonNumber,
              episode: mediaItem.mediaItem.episodeNumber,

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
          const file = await this.videoSeekThumbnailControllerHelper.parseRequestedFile(request, reply, (request.body as any)?.file, apolloUser);
          if (file == null) {
            return reply;
          }

          videoLiveTranscodeMedia = await playerSession.startLiveTranscode(file, startOffset, {
            mediaItemId: '0', // FIXME
            title: file.getFileName(),
          });
        }
      } finally {
        releaseStartPlaybackLock();
      }

      return reply
        .status(200)
        .type('application/json')
        .send({
          type: 'live-transcode',
          hlsManifest: `/api/_frontend/media/player-session/${encodeURIComponent(playerSession.id)}/file/${this.encodeUriProperly(videoLiveTranscodeMedia.relativePublicPathToHlsManifest)}`,
          totalDurationInSeconds: videoLiveTranscodeMedia.totalDurationInSeconds,
          startOffsetInSeconds: videoLiveTranscodeMedia.startOffset,
          mediaMetadata: videoLiveTranscodeMedia.mediaMetadata,

          additionalStreams: {
            subtitles: videoLiveTranscodeMedia.subtitleMetadata.subtitles.map(stream => ({
              title: stream.title,
              language: stream.language,
              codecName: stream.codecName,
              uri: `/api/_frontend/media/player-session/${encodeURIComponent(playerSession.id)}/file/${this.encodeUriProperly(stream.uri)}`,
              fonts: videoLiveTranscodeMedia.subtitleMetadata.fonts.map(font => ({
                uri: `/api/_frontend/media/player-session/${encodeURIComponent(playerSession.id)}/file/${this.encodeUriProperly(font.uri)}`,
              })),
            })),
          },
        } satisfies StartPlaybackResponse);
    });

    server.post('/:sessionId/change-media-youtube', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession == null) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found');
      }
//      if (playerSession?.owner.id !== apolloUser.id) {
//        return reply
//          .status(403)
//          .type('text/plain')
//          .send('Session not found or you are not the owner of this session');
//      }

      const videoId: unknown = (request.body as any)?.videoId;
      if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        return reply
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid or missing videoId: expected an 11-character YouTube video ID' });
      }

      const startSeconds: number | undefined = typeof (request.body as any)?.startSeconds === 'number'
        ? Math.max(0, (request.body as any).startSeconds)
        : undefined;

      const title: string = typeof (request.body as any)?.title === 'string' && (request.body as any).title.length > 0
        ? (request.body as any).title
        : videoId;

      playerSession.startYouTube(videoId, startSeconds, title);

      return reply
        .status(200)
        .type('application/json')
        .send({
          type: 'youtube',
          videoId,
          startSeconds,
          title,
        } satisfies YouTubeMediaInfo);
    });

    server.post('/:sessionId/change-media-twitch', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession == null) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found');
      }
//      if (playerSession?.owner.id !== apolloUser.id) {
//        return reply
//          .status(403)
//          .type('text/plain')
//          .send('Session not found or you are not the owner of this session');
//      }

      const channelName: unknown = (request.body as any)?.channelName;
      if (typeof channelName !== 'string' || !/^[A-Za-z0-9_]{1,25}$/.test(channelName)) {
        return reply
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid or missing channelName: expected a Twitch channel name (1-25 alphanumeric characters or underscores)' });
      }

      const title: string = typeof (request.body as any)?.title === 'string' && (request.body as any).title.length > 0
        ? (request.body as any).title
        : channelName;

      playerSession.startTwitch(channelName, title);

      return reply
        .status(200)
        .type('application/json')
        .send({
          type: 'twitch',
          channelName,
          title,
        } satisfies TwitchMediaInfo);
    });

    server.post('/:sessionId/regenerate-join-token', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession?.owner.id !== apolloUser.id) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found or you are not the owner of this session');
      }
      const joinToken = playerSession.regenerateJoinToken();

      return reply
        .status(200)
        .type('application/json')
        .send({
          shareUrl: this.appConfiguration.config.baseUrl + `/api/_frontend/media/player-session/join?token=${encodeURIComponent(joinToken.token)}`,
          joinToken,
        } satisfies RegenerateJoinTokenResponse);
    });
  }

  private findPlayerSessionByQueryParamOrSessionCookie(request: FastifyRequest, reply: FastifyReply, loggedInUser: ApolloUser): PlayerSession | null {
    const inputSessionId = (request.query as any).session;
    if (inputSessionId == null || inputSessionId === '') {
      return this.playerSessionStorage.findOrCreateBySessionCookie(loggedInUser, request.headers.cookie?.split(';')
        ?.find(s => s.includes('apollo.session_token')) ?? '');
    }

    if (typeof inputSessionId !== 'string') {
      reply
        .status(400)
        .type('text/plain')
        .send('Invalid session ID format');
      return null;
    }

    const playerSession = this.playerSessionStorage.findById(inputSessionId);
    if (playerSession == null || !playerSession.checkAccessForUser(loggedInUser)) {
      reply
        .status(404)
        .type('text/plain')
        .send('Player session not found or you do not have access to it');
      return null;
    }

    return playerSession;
  }

  private findPlayerSessionFromPath(req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply, apolloUser: ApolloUser): PlayerSession | null {
    const playerSession = this.playerSessionStorage.findById(req.params.sessionId);
    if (playerSession == null || !playerSession.checkAccessForUser(apolloUser)) {
      reply
        .status(404)
        .type('text/plain')
        .send('Player session not found or you do not have access to it');
      return null;
    }

    return playerSession;
  }

  private async sendFileRespectingRequestedRange(request: FastifyRequest, reply: FastifyReply, file: string, mimeType: string, sendAsAttachment: boolean = false): Promise<void> {
    if (!Path.isAbsolute(file)) {
      throw new Error('File path is not absolute');
    }

    let fileStat: Fs.Stats = await Fs.promises.stat(file);

    const fileSize = fileStat.size;
    const parsedRange = this.determineRange(request, fileSize, { combine: true });

    let bytesStart = undefined;
    let bytesEnd = undefined;
    if (Array.isArray(parsedRange)) {
      bytesStart = parsedRange[0].start;
      bytesEnd = parsedRange[0].end;

      if (bytesEnd > fileSize) {
        return reply
          .status(416)
          .send(`Requested range not satisfiable (file has ${fileSize} bytes)`);
      }
    }

    const readStreamOptions = { start: bytesStart, end: bytesEnd };
    const fileReadStream = Fs.createReadStream(file, readStreamOptions);

    fileReadStream.on('error', (err: any) => {
      console.error(err);

      fileReadStream.destroy();
      reply.raw.end();
    });

    reply.raw.on('close', () => {
      fileReadStream.destroy();
    });

    reply
      .type(mimeType)
      .header('Accept-Ranges', 'bytes');

    if (sendAsAttachment) {
      reply.header('Content-Disposition', `attachment; filename="${Path.basename(file)}"`);
    }

    reply.header('Content-Length', fileSize);
    if (bytesStart != undefined && bytesEnd != undefined) {
      reply
        .status(206)
        .header('Content-Length', bytesEnd - bytesStart + 1)
        .header('Content-Range', `bytes ${bytesStart}-${bytesEnd}/${fileSize}`);
    }

    fileReadStream.pipe(reply.raw);
  }

  private determineRange(request: FastifyRequest, fileSize: number, rangeParserOptions?: { combine: boolean }) {
    const range = request.headers.range;
    if (!range) {
      return;
    }

    const throwOnInvalid = false;

    const res = rangeParser(fileSize, range, rangeParserOptions);
    if (typeof res === 'number' && res < 0) {
      if (throwOnInvalid && res === -2) {
        throw new Error('Malformed header string');
      } else if (throwOnInvalid && res === -1) {
        throw new Error('Unsatisfiable range');
      }

      return undefined;
    }

    return { unit: (res as any).type, ranges: res };
  }

  private encodeUriProperly(uri: string): string {
    return uri.split('/')
      .map(encodeURIComponent)
      .join('/');
  }

  private parseUserInputInt(reply: FastifyReply, userInput: unknown, defaultValue: number): number | null {
    if (userInput == null) {
      return defaultValue;
    }

    if (typeof userInput === 'string' && /^[0-9]+$/.test(userInput)) {
      userInput = parseInt(userInput, 10);
    }

    if (typeof userInput === 'number' && Number.isSafeInteger(userInput) && userInput >= 0) {
      return userInput;
    }


    reply
      .status(400)
      .type('application/json')
      .send({ error: `Parameter 'startOffset' needs to be a positive integer or 'auto'` });
    return null;
  }

  private parseUserInputBigInt(userInput: unknown, defaultValue: bigint): bigint {
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

  private findMediaItem(mediaItemId: bigint, accessingUser: ApolloUser): Promise<ReadContentsAwareLibraryMediaItem> {
    return this.permissionAwareLibraryMediaItemProvider.provideForReadContents(mediaItemId, accessingUser);
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await Fs.promises.stat(path);
      return true;
    } catch (err: any) {
      if (err instanceof Error && (err as any).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }
}
