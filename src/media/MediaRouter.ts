import {handleRequestRestfully, StringUtils} from '@spraxdev/node-commons';
import express from 'express';
import Crypto from 'node:crypto';
import Path from 'node:path';
import sharp from 'sharp';
import FileSystemBasedCache from '../cache/FileSystemBasedCache';
import MediaLibraryTable, {LibraryMedia} from '../database/postgres/MediaLibraryTable';
import MediaLibraryEditMediaTemplate from '../frontend/MediaLibraryEditMediaTemplate';
import MediaLibraryTemplate from '../frontend/MediaLibraryTemplate';
import MediaLibraryTitleTemplate from '../frontend/MediaLibraryTitleTemplate';
import MediaTemplate from '../frontend/MediaTemplate';
import ProcessBuilder from '../process_manager/ProcessBuilder';
import ThumbnailGenerator from '../ThumbnailGenerator';
import UserFileHelper from '../UserFileHelper';
import WebServer from '../webserver/WebServer';
import LibraryManager from './libraries/LibraryManager';
import VideoAnalyser from './video/analyser/VideoAnalyser';
import {createWatchRouter} from './watch/WatchRouter';

export function createMediaRouter(webserver: WebServer, sessionMiddleware: express.RequestHandler): express.Router {
  const router = express.Router();

  router.use('/watch', createWatchRouter(webserver, sessionMiddleware));

  router.use('/library/:libraryId/:titleId/assets/:fileName?', (req, res, next) => {
    handleRequestRestfully(req, res, next, {
      get: async () => {
        const requestedLibraryId = req.params.libraryId;
        const requestedTitleId = req.params.titleId;
        const requestedFileName = req.params.fileName;
        if (requestedTitleId == null) {
          res.redirect('/media/library/' + encodeURIComponent(requestedLibraryId));
          return;
        }

        if (requestedFileName != 'poster.png') {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not found!`);
          return;
        }

        // TODO: early escapes if 'requestedLibraryId' or 'requestedTitleId' are not numeric

        const user = WebServer.getUser(req);
        const library = await new LibraryManager(user).getLibrary(requestedLibraryId);

        if (library == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Library with id '${requestedLibraryId}' not found!`);
          return;
        }

        const libraryTitle = await library.fetchTitle(requestedTitleId);
        if (libraryTitle == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Title with id '${requestedTitleId}' not found in library '${library.id}'!`);
          return;
        }

        const libraryTitleDirectory = user.getDefaultFileSystem().getFile(libraryTitle.directoryPath);
        if (!(await libraryTitleDirectory.isDirectory())) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not found!`);
          return;
        }

        const posterFile = await UserFileHelper.findFolderPoster(libraryTitleDirectory);
        const posterFileStat = await posterFile?.stat();
        if (posterFile == null || posterFileStat == null || !posterFileStat.isFile()) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not found!`);
          return;
        }

        const posterCacheKey = `${req.originalUrl}${posterFileStat.mtime.getTime()}${posterFileStat.size}`;
        const cachedPoster = await FileSystemBasedCache.getInstance().getUserAssociatedCachedFile(posterFile.getOwner(), posterCacheKey);
        if (cachedPoster != null) {
          res
            .type('image/png')
            .send(cachedPoster);
          return;
        }

        const posterMimeType = await posterFile.getMimeType();
        if (posterMimeType == null || !posterMimeType.startsWith('image/')) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not available!`);
          return;
        }

        const sharpInstance = sharp().png();
        posterFile.getReadStream().pipe(sharpInstance);
        const posterData = await sharpInstance.toBuffer();

        await FileSystemBasedCache.getInstance().setUserAssociatedCachedFile(posterFile.getOwner(), posterCacheKey, posterData);
        res
          .type('image/png')
          .send(posterData);
      }
    });
  });

  router.use('/library/:libraryId/:titleId/:requestedMediaFilePathBase64/assets/:fileName?', (req, res, next) => {
    handleRequestRestfully(req, res, next, {
      get: async () => {
        const requestedLibraryId = req.params.libraryId;
        const requestedTitleId = req.params.titleId;
        const requestedMediaFilePathBase64 = req.params.requestedMediaFilePathBase64;
        const requestedFileName = req.params.fileName;

        if (requestedFileName != 'thumbnail.png') {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not found!`);
          return;
        }

        // TODO: early escapes if 'requestedLibraryId', 'requestedTitleId' or 'requestedMediaId' are not numeric

        const user = WebServer.getUser(req);
        const library = await new LibraryManager(user).getLibrary(requestedLibraryId);

        if (library == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Library with id '${requestedLibraryId}' not found!`);
          return;
        }

        const requestedMediaFilePath = Buffer.from(requestedMediaFilePathBase64, 'base64').toString('utf8');
        const libraryTitleMedia = await library.fetchMedia(requestedTitleId, requestedMediaFilePath);
        if (libraryTitleMedia == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Media with path '${requestedMediaFilePath}' for title '${requestedTitleId}' not found in library '${library.id}'!`);
          return;
        }

        const mediaFile = user.getDefaultFileSystem().getFile(libraryTitleMedia.filePath);
        const mediaFileStat = await mediaFile.stat();
        if (!mediaFileStat.isFile()) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not found!`);
          return;
        }

        const thumbnailCacheKey = `${req.originalUrl}${mediaFileStat.mtime.getTime()}${mediaFileStat.size}`;
        const cachedThumbnail = await FileSystemBasedCache.getInstance().getUserAssociatedCachedFile(mediaFile.getOwner(), thumbnailCacheKey);
        if (cachedThumbnail != null) {
          res
            .type('image/png')
            .send(cachedThumbnail);
          return;
        }

        const thumbnail = await new ThumbnailGenerator().generateThumbnail(mediaFile);
        if (thumbnail == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Unable to generate thumbnail for '${requestedFileName}'!`);
          return;
        }

        await FileSystemBasedCache.getInstance().setUserAssociatedCachedFile(mediaFile.getOwner(), thumbnailCacheKey, thumbnail.data);
        res
          .type(thumbnail.mime)
          .send(thumbnail.data);
      }
    });
  });

  router.use('/library/:libraryId/:titleId', (req, res, next) => {
    handleRequestRestfully(req, res, next, {
      get: async () => {
        const requestedLibraryId = req.params.libraryId;
        const requestedTitleId = req.params.titleId;

        // TODO: early escapes if 'requestedLibraryId' or 'requestedTitleId' are not numeric

        const user = WebServer.getUser(req);
        const library = await new LibraryManager(user).getLibrary(requestedLibraryId);

        if (library == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Library with id '${requestedLibraryId}' not found!`);
          return;
        }

        const libraryTitle = await library.fetchTitle(requestedTitleId);
        if (libraryTitle == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Title with id '${requestedTitleId}' not found in library '${library.id}'!`);
          return;
        }

        const media = await MediaLibraryTable.getInstance().getLibraryMediaByTitleOrderedBySeasonAndEpisode(library.id, libraryTitle.id);
        const groupedMedia = new Map<string, LibraryMedia[]>();
        for (const mediaItem of media) {
          const key = mediaItem.season != null ? `Season ${mediaItem.season}` : 'Sonstiges';
          if (!groupedMedia.has(key)) {
            groupedMedia.set(key, []);
          }
          groupedMedia.get(key)!.push(mediaItem);
        }

        res.send(new MediaLibraryTitleTemplate().render(req, {
          library,
          title: libraryTitle,
          media: groupedMedia
        }));
      }
    });
  });

  router.use('/library/:libraryId?', (req, res, next) => {
    handleRequestRestfully(req, res, next, {
      get: async () => {
        const requestedLibraryId = req.params.libraryId;
        if (requestedLibraryId == null) {
          res.redirect('/media');
          return;
        }

        const user = WebServer.getUser(req);

        const library = await new LibraryManager(user).getLibrary(requestedLibraryId);
        if (library == null) {
          res
            .status(404)
            .type('text/plain')
            .send(`Library with id '${requestedLibraryId}' not found!`);
          return;
        }

        res.send(new MediaLibraryTemplate().render(req, {
          library,
          titles: await library.fetchTitles()
        }));
      }
    });
  });

  router.use('/', (req, res, next) => {
    handleRequestRestfully(req, res, next, {
      get: async () => {
        const user = WebServer.getUser(req);
        const libraryManager = new LibraryManager(user);

        res.send(new MediaTemplate().render(req, {
          libraries: await libraryManager.getLibraries()
        }));
      }
    });
  });

  return router;
}
