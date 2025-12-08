import type { FastifyInstance, FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import UserByAuthProvider from '../../../../../auth/UserByAuthProvider.js';
import { ContainerTokens } from '../../../../../constants.js';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import LibraryManager from '../../../../../plugins/official/media/_old/libraries/LibraryManager.js';
import ThumbnailGenerator from '../../../../../plugins/official/media/_old/ThumbnailGenerator.js';
import type { default as Router, RouteReturn } from '../../../Router.js';

// TODO: Refactor this
@injectable({ token: ContainerTokens.ROUTER })
export default class MediaRouter implements Router {
  constructor(
    private readonly userByAuthProvider: UserByAuthProvider,
    private readonly fileSystemProvider: FileSystemProvider,
    private readonly thumbnailGenerator: ThumbnailGenerator,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/media';
  }

  register(server: FastifyInstance): void {
    server.get('/:libraryId/:mediaId/:mediaItemId/thumbnail-new.png', async (request: FastifyRequest<{ Params: { libraryId: string, mediaId: string, mediaItemId: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = await this.userByAuthProvider.provideByHeaders(request.headers);
      if (apolloUser == null) {
        return reply
          .status(401)
          .send({ error: 'Unauthorized' });
      }

      const requestedLibraryId = request.params.libraryId;
      const requestedMediaId = request.params.mediaId;
      const requestedMediaItemId = request.params.mediaItemId;

      const library = await new LibraryManager(apolloUser).getLibrary(requestedLibraryId);
      if (library == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Library with id '${requestedLibraryId}' not found!`);
      }

      const media = await library.fetchMedia(BigInt(requestedMediaId));
      if (media == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Media with id '${requestedMediaId}' not found in library '${library.id}'!`);
      }

      const mediaItem = await library.fetchMediaItem(BigInt(requestedMediaItemId));
      if (mediaItem == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Media item with id '${requestedMediaItemId}' not found for media '${requestedMediaId}' in library '${library.id}'!`);
      }

      const libraryOwnerFileSystems = await this.fileSystemProvider.provideForUser(library.owner);
      const libraryOwnerDefaultFileSystem = libraryOwnerFileSystems.user[0];

      const mediaFile = libraryOwnerDefaultFileSystem.getFile(mediaItem.filePath);
      const mediaFileStat = await mediaFile.stat();
      if (!mediaFileStat.isFile()) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`File '${mediaItem.filePath}' not found!`);
      }

      //      const thumbnailCacheKey = `${req.originalUrl}${mediaFileStat.mtime.getTime()}${mediaFileStat.size}`;
      //      const cachedThumbnail = await FileSystemBasedCache.getInstance()
      //        .getUserAssociatedCachedFile(mediaFile.fileSystem.owner, thumbnailCacheKey);
      //      if (cachedThumbnail != null) {
      //        return reply
      //          .type('image/png')
      //          .send(cachedThumbnail);
      //      }

      if (!(mediaFile instanceof LocalFile)) {
        throw new Error('Only LocalFile is supported in MediaRouter for thumbnail generation');
      }

      const thumbnail = await this.thumbnailGenerator.generateThumbnail(mediaFile);
      if (thumbnail == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Unable to generate thumbnail for '${mediaItem.filePath}'!`);
      }

      //      await FileSystemBasedCache.getInstance()
      //        .setUserAssociatedCachedFile(mediaFile.fileSystem.owner, thumbnailCacheKey, thumbnail.data);
      return reply
        .type(thumbnail.mime)
        .send(thumbnail.data);
    });

    server.get('/:libraryId/:titleId/:mediaItemPathBase64/thumbnail.png', async (request: FastifyRequest<{ Params: { libraryId: string, titleId: string, mediaItemPathBase64: string } }>, reply): Promise<RouteReturn> => {
      const apolloUser = await this.userByAuthProvider.provideByHeaders(request.headers);
      if (apolloUser == null) {
        return reply
          .status(401)
          .send({ error: 'Unauthorized' });
      }

      const requestedLibraryId = request.params.libraryId;
      const requestedTitleId = request.params.titleId;
      const requestedMediaFilePathBase64 = request.params.mediaItemPathBase64;
      const requestedFileName = 'thumbnail.png';

      const library = await new LibraryManager(apolloUser).getLibrary(requestedLibraryId);

      if (library == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Library with id '${requestedLibraryId}' not found!`);
      }

      const requestedMediaFilePath = Buffer.from(requestedMediaFilePathBase64, 'base64').toString('utf8');
      const libraryTitleMedia = await library.fetchMediaItemByPath(requestedTitleId, requestedMediaFilePath);
      if (libraryTitleMedia == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Media with path '${requestedMediaFilePath}' for title '${requestedTitleId}' not found in library '${library.id}'!`);
      }

      const libraryOwnerFileSystems = await this.fileSystemProvider.provideForUser(library.owner);
      const libraryOwnerDefaultFileSystem = libraryOwnerFileSystems.user[0];

      const mediaFile = libraryOwnerDefaultFileSystem.getFile(libraryTitleMedia.filePath);
      const mediaFileStat = await mediaFile.stat();
      if (!mediaFileStat.isFile()) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`File '${requestedFileName}' not found!`);
      }

      //      const thumbnailCacheKey = `${req.originalUrl}${mediaFileStat.mtime.getTime()}${mediaFileStat.size}`;
      //      const cachedThumbnail = await FileSystemBasedCache.getInstance()
      //        .getUserAssociatedCachedFile(mediaFile.fileSystem.owner, thumbnailCacheKey);
      //      if (cachedThumbnail != null) {
      //        return reply
      //          .type('image/png')
      //          .send(cachedThumbnail);
      //      }

      if (!(mediaFile instanceof LocalFile)) {
        throw new Error('Only LocalFile is supported in MediaRouter for thumbnail generation');
      }

      const thumbnail = await this.thumbnailGenerator.generateThumbnail(mediaFile);
      if (thumbnail == null) {
        return reply
          .status(404)
          .type('text/plain')
          .send(`Unable to generate thumbnail for '${requestedFileName}'!`);
      }

      //      await FileSystemBasedCache.getInstance()
      //        .setUserAssociatedCachedFile(mediaFile.fileSystem.owner, thumbnailCacheKey, thumbnail.data);
      return reply
        .type(thumbnail.mime)
        .send(thumbnail.data);
    });
  }
}
