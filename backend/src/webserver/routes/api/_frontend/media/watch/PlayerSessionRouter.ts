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
import MediaLibraryMediaFinder
  from '../../../../../../plugins/official/media/_old/library/MediaLibraryMedia/MediaLibraryMediaFinder.js';
import type MediaLibraryMediaItem
  from '../../../../../../plugins/official/media/_old/library/MediaLibraryMediaItem/MediaLibraryMediaItem.js';
import MediaLibraryMediaItemFinder
  from '../../../../../../plugins/official/media/_old/library/MediaLibraryMediaItem/MediaLibraryMediaItemFinder.js';
import ApolloFileUrl from '../../../../../../plugins/official/media/_old/url/ApolloFileUrl.js';
import type {
  PlayerSessionInfoResponse,
  RegenerateJoinTokenResponse,
  StartPlaybackResponse,
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
    private readonly libraryMediaFinder: MediaLibraryMediaFinder,
    private readonly libraryMediaItemFinder: MediaLibraryMediaItemFinder,
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
          playbackStatus: currentMedia != null ? {
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
          } : null,
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
        if (mediaItem == null || !mediaItem.canRead(apolloUser)) {
          return reply
            .status(404)
            .type('text/plain')
            .send('The requested media file does not exist or you do not have permission to read it');
        }

        let startOffset: number | null = null;

        if (request.query.startOffset === 'auto') {
          const watchProgress = await (await new LibraryManager(apolloUser).getLibrary(mediaItem.libraryId.toString()))!.fetchMediaWatchProgressInSeconds(mediaItemId);
          startOffset = watchProgress ?? 0;
        }

        if (startOffset == null) {
          startOffset = this.parseUserInputInt(reply, request.query.startOffset, 0);
          if (startOffset == null) {
            return reply;
          }
        }

        const owningUser = await this.userProvider.findById(mediaItem.libraryOwnerId);
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

        const apolloFile = owningUserDefaultFileSystem.getFile(Path.join(mediaItem.mediaBaseDir.filePath, mediaItem.relativeFilePath));
        const surroundingMediaItems = await this.libraryMediaItemFinder.findSurroundingMediaItems(mediaItem.id, mediaItem.libraryMediaId);

        const libraryMedia = await this.libraryMediaFinder.find(mediaItem.libraryMediaId);
        if (libraryMedia == null) {
          throw new Error('Unable to find the LibraryMedia for the MediaItem (this should never happen)');
        }

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

      return reply.redirect('/media/watch', Http2.constants.HTTP_STATUS_TEMPORARY_REDIRECT);
    });

    server.get('/:sessionId/file/*', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = request.getAuthenticatedUser();
      // TODO: Support for Anonymous users?

      const playerSession = this.findPlayerSessionFromPath(request, reply, apolloUser);
      if (playerSession?.owner.id !== apolloUser.id) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found or you are not the owner of this session');
      }

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
      if (playerSession?.owner.id !== apolloUser.id) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found or you are not the owner of this session');
      }

      const currentFile = playerSession.getCurrentMedia()?.sourceFile;
      if (currentFile != null) {
        (request.query as any).file = ApolloFileUrl.create(currentFile.fileSystem.getOwnerOrThrow().id, currentFile.fileSystem.id, currentFile.path).toString();
      }

      const inputs = await this.videoSeekThumbnailControllerHelper.parseRequestFileAndThumbnailIndex(request, reply, apolloUser);
      if (inputs == null) {
        return reply;
      }

      let responseBody: string | Buffer;

      const releaseGenerationLock = await this.videoSeekThumbnailControllerHelper.acquireGenerationLock(ApolloFileUrl.create(inputs.file.fileSystem.getOwnerOrThrow().id, inputs.file.fileSystem.id, inputs.file.path)); // acquire lock before any further async operations
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
      if (playerSession?.owner.id !== apolloUser.id) {
        return reply
          .status(403)
          .type('text/plain')
          .send('Session not found or you are not the owner of this session');
      }

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
          if (mediaItem == null) {
            return reply;
          }
          if (!mediaItem.canRead(apolloUser)) {
            throw new Error('The requested media file does not exist or you do not have permission to read it');
          }

          const libraryMedia = await this.libraryMediaFinder.find(mediaItem.libraryMediaId);
          if (libraryMedia == null) {
            throw new Error('Unable to find the LibraryMedia for the MediaItem (this should never happen)');
          }

          const surroundingMediaItems = await this.libraryMediaItemFinder.findSurroundingMediaItems(mediaItem.id, mediaItem.libraryMediaId);

          const owningUser = await this.userProvider.findById(mediaItem.libraryOwnerId);
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

          videoLiveTranscodeMedia = await playerSession.startLiveTranscode(owningUserDefaultFileSystem.getFile(Path.join(mediaItem.mediaBaseDir.filePath, mediaItem.relativeFilePath)), startOffset, {
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

  private findPlayerSessionFromPath(req: FastifyRequest<{
    Params: { sessionId: string }
  }>, reply: FastifyReply, apolloUser: ApolloUser): PlayerSession | null {
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

  private async findMediaItem(mediaItemId: bigint, accessingUser: ApolloUser): Promise<MediaLibraryMediaItem | null> {
    const mediaItem = await this.libraryMediaItemFinder.find(mediaItemId);

    if (mediaItem != null && !mediaItem.canRead(accessingUser)) {
      throw new Error('Media Item does not exist or you do not have permission to read it');  // TODO: show 404 page
    }
    return mediaItem;
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
