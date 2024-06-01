import * as PrismaClient from '@prisma/client';
import { handleRequestRestfully, StringUtils } from '@spraxdev/node-commons';
import express from 'express';
import Crypto from 'node:crypto';
import Path from 'node:path';
import sharp from 'sharp';
import FileSystemBasedCache from '../cache/FileSystemBasedCache';
import { getPrismaClient } from '../Constants';
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
import { createWatchRouter } from './watch/WatchRouter';

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

        const libraryTitleDirectory = library.owner.getDefaultFileSystem().getFile(libraryTitle.directoryPath);
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
          const titleStartingLetters = libraryTitle.title
            .split(/[\s_-]/g)
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase();

          const posterData = await sharp({
            create: {
              width: 400,
              height: 600,
              channels: 3,
              background: { r: 125, g: 125, b: 125 }
            }
          })
            .composite([{
              input: {
                text: {
                  text: `<span foreground="white">${titleStartingLetters}</span>`,
                  rgba: true,
                  width: 300,
                  height: 400
                }
              }
            }])
            .png()
            .toBuffer();

          res
            .type('image/png')
            .send(posterData);
          return;
        }

        const posterCacheKey = `${req.originalUrl}${posterFileStat.mtime.getTime()}${posterFileStat.size}`;
        const cachedPoster = await FileSystemBasedCache.getInstance().getUserAssociatedCachedFile(posterFile.fileSystem.owner, posterCacheKey);
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
        const posterData = await sharpInstance.removeAlpha().toBuffer();

        await FileSystemBasedCache.getInstance().setUserAssociatedCachedFile(posterFile.fileSystem.owner, posterCacheKey, posterData);
        res
          .type('image/png')
          .send(posterData);
      }
    });
  });

  router.use('/library/:libraryId/:titleId/:requestedMediaFilePathBase64/edit', (req, res, next) => {
    handleRequestRestfully(req, res, next, {
      get: async () => {
        const requestedLibraryId = req.params.libraryId;
        const requestedTitleId = req.params.titleId;
        const requestedMediaFilePathBase64 = req.params.requestedMediaFilePathBase64;

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

        const mediaFile = library.owner.getDefaultFileSystem().getFile(libraryTitleMedia.filePath);
        if (mediaFile.fileSystem.owner.id !== user.id) {
          res
            .status(403)
            .type('text/plain')
            .send();
          return;
        }

        const mediaFileStat = await mediaFile.stat();
        if (!mediaFileStat.isFile()) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedMediaFilePath}' is not a file!`);
          return;
        }

        const videoAnalysis = await VideoAnalyser.analyze(mediaFile.getAbsolutePathOnHost(), true);
        const chapters = videoAnalysis.chapters.map(chapter => ({
          start: chapter.start,
          end: chapter.end,
          tags: chapter.tags
        }));
        const streams = videoAnalysis.streams.map(stream => ({
          index: stream.index,
          codecType: stream.codecType,
          codecNameLong: stream.codecNameLong,
          tags: stream.tags
        }));

        res.send(new MediaLibraryEditMediaTemplate().render(req, {
          videoAnalysis: {
            fileName: mediaFile.getFileName(),
            formatNameLong: videoAnalysis.file.formatNameLong,
            probeScore: videoAnalysis.file.probeScore,
            duration: videoAnalysis.file.duration,

            tags: videoAnalysis.file.tags,
            chapters,
            streams
          }
        }));
      },

      post: async () => {
        const requestedLibraryId = req.params.libraryId;
        const requestedTitleId = req.params.titleId;
        const requestedMediaFilePathBase64 = req.params.requestedMediaFilePathBase64;

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

        const mediaFile = library.owner.getDefaultFileSystem().getFile(libraryTitleMedia.filePath);
        const mediaFileStat = await mediaFile.stat();
        if (!mediaFileStat.isFile()) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedMediaFilePath}' is not a file!`);
          return;
        }

        await WebServer.runMiddleware(req, res, express.json());

        const reqBodyFileTags = req.body?.fileTags;
        if (!Array.isArray(reqBodyFileTags)) {
          res
            .status(400)
            .send('Invalid request body (fileTags not an array)!');
          return;
        }

        const reqBodyStreamTags = req.body?.streamTags;
        if (!Array.isArray(reqBodyStreamTags)) {
          res
            .status(400)
            .send('Invalid request body (streamTags not an array)!');
          return;
        }

        const fileTagsToWrite: { key: string, value: string }[] = [];

        reqBodyFileTags.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const tag of reqBodyFileTags) {
          if (tag.key == null || tag.value == null) {
            throw new Error(`Invalid fileTag (key or value null): ${JSON.stringify(tag)}`);
          }

          if (tag.key.trim() == '') {
            if (tag.value.trim() != '') {
              res
                .status(400)
                .send(`Invalid fileTag (empty key but non-empty value): ${JSON.stringify(tag)}`);
              return;
            }
            continue;
          }

          if (!/^[a-z0-9_]+$/i.test(tag.key.trim())) {
            res
              .status(400)
              .send(`Invalid fileTag (key contains invalid characters): ${JSON.stringify(tag)}`);
            return;
          }
          if (fileTagsToWrite.find(t => t.key == tag.key.trim()) != null) {
            res
              .status(400)
              .send(`Invalid fileTag (duplicate key): ${JSON.stringify(tag)}`);
            return;
          }

          fileTagsToWrite.push({
            key: tag.key.trim(),
            value: tag.value.trim()
          });
        }

        const streamTagsToWrite: { [streamIndex: number]: ({ key: string, value: string }[]) } = {};

        reqBodyStreamTags.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const tag of reqBodyStreamTags) {
          const streamIndex = tag.streamIndex;
          if (!StringUtils.isNumeric(streamIndex)) {
            throw new Error(`Invalid streamTag (streamIndex not numeric): ${JSON.stringify(tag)}`);
          }

          const streamIndexNumber = parseInt(streamIndex);
          if (streamTagsToWrite[streamIndexNumber] == null) {
            streamTagsToWrite[streamIndexNumber] = [];
          }
          const streamTags = streamTagsToWrite[streamIndexNumber];

          if (tag.key == null || tag.value == null) {
            throw new Error(`Invalid streamTag (key or value null): ${JSON.stringify(tag)}`);
          }

          if (tag.key.trim() == '') {
            if (tag.value.trim() != '') {
              res
                .status(400)
                .send(`Invalid streamTag (empty key but non-empty value): ${JSON.stringify(tag)}`);
              return;
            }
            continue;
          }

          if (!/^[a-z0-9_-]+$/i.test(tag.key.trim())) {
            res
              .status(400)
              .send(`Invalid streamTag (key contains invalid characters): ${JSON.stringify(tag)}`);
            return;
          }
          if (streamTags.find(t => t.key == tag.key.trim()) != null) {
            res
              .status(400)
              .send(`Invalid streamTag (duplicate key): ${JSON.stringify(tag)}`);
            return;
          }

          streamTags.push({
            key: tag.key.trim(),
            value: tag.value.trim()
          });
        }

        const args = [
          '-bitexact',
          '-n',

          '-i', mediaFile.getAbsolutePathOnHost(),
          '-map', '0',
          '-c', 'copy',

          '-map_metadata:g', '-1'
        ];

        for (const streamIndex of Object.keys(streamTagsToWrite)) {
          args.push(`-map_metadata:s:${streamIndex}`, '-1');
        }

        for (const tag of fileTagsToWrite) {
          args.push('-metadata', `${tag.key}=${tag.value}`);
        }

        for (const streamIndex of Object.keys(streamTagsToWrite)) {
          const streamTags = streamTagsToWrite[parseInt(streamIndex)];
          for (const tag of streamTags) {
            args.push(`-metadata:s:${streamIndex}`, `${tag.key}=${tag.value}`);
          }
        }

        const temporaryFileName = `${mediaFile.getFileName()}.${Crypto.randomUUID()}.${Path.extname(mediaFile.getFileName())}`;
        const temporaryFile = user.getDefaultFileSystem().getFile(Path.join(mediaFile.path, '..', temporaryFileName));
        args.push(temporaryFile.getAbsolutePathOnHost());

        await user.getDefaultFileSystem().acquireLock(req, temporaryFile, async (temporaryFileWriteable) => {
          const childProcess = await new ProcessBuilder('ffmpeg', args)
            .errorOnNonZeroExit()
            .runPromised();

          if (childProcess.err) {
            await temporaryFileWriteable.deleteIgnoringTrashBin({ force: true });
            throw childProcess.err;
          }

          await user.getDefaultFileSystem().acquireLock(req, mediaFile, async (mediaFileWriteable) => {
            await temporaryFileWriteable.move(mediaFileWriteable);
          });

          res
            .status(200)
            .send({ success: true });
        });
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

        const mediaFile = library.owner.getDefaultFileSystem().getFile(libraryTitleMedia.filePath);
        const mediaFileStat = await mediaFile.stat();
        if (!mediaFileStat.isFile()) {
          res
            .status(404)
            .type('text/plain')
            .send(`File '${requestedFileName}' not found!`);
          return;
        }

        const thumbnailCacheKey = `${req.originalUrl}${mediaFileStat.mtime.getTime()}${mediaFileStat.size}`;
        const cachedThumbnail = await FileSystemBasedCache.getInstance().getUserAssociatedCachedFile(mediaFile.fileSystem.owner, thumbnailCacheKey);
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

        await FileSystemBasedCache.getInstance().setUserAssociatedCachedFile(mediaFile.fileSystem.owner, thumbnailCacheKey, thumbnail.data);
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

        const media = await getPrismaClient()!.mediaLibraryMediaItem.findMany({
          where: {
            mediaId: BigInt(libraryTitle.id)
          },
          orderBy: [
            { seasonNumber: 'asc' },
            { episodeNumber: 'asc' }
          ]
        });

        //        const media = await MediaLibraryTable.getInstance().getLibraryMediaByTitleOrderedBySeasonAndEpisode(library.id, libraryTitle.id);
        const groupedMedia = new Map<string, PrismaClient.MediaLibraryMediaItem[]>();
        for (const mediaItem of media) {
          const key = mediaItem.seasonNumber != null ? `Season ${mediaItem.seasonNumber}` : 'Sonstiges';
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
