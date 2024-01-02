import { handleRequestRestfully, StringUtils } from '@spraxdev/node-commons';
import express from 'express';
import Fs from 'node:fs';
import { getFileNameCollator } from '../../Constants';
import IUserFile from '../../files/IUserFile';
import VideoAnalyser from '../../media/video/analyser/VideoAnalyser';
import { ExtendedVideoAnalysis } from '../../media/video/analyser/VideoAnalyser.Types';
import VideoTagWriter from '../../media/video/tag-writer/VideoTagWriter';
import CompletableTask from '../../process_manager/tasks/CompletableTask';
import TaskStorage from '../../process_manager/tasks/TaskStorage';
import Utils from '../../Utils';
import WebServer from '../WebServer';

type VideoAnalysisResult = {
  filePath: string,
  fileName: string,
  formatNameLong: string,
  probeScore: number,
  duration: string,

  tags: { [key: string]: string },
  chapters: { start: number, end: number, tags: { [key: string]: string } }[],
  streams: {
    index: number,
    codecType: string,
    codecNameLong: string,
    tags: { [key: string]: string },
    disposition: { [key: string]: 0 | 1 }
  }[];
};

export const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization');
  next();
});

function requireAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.user == null) {
    res
      .status(401)
      .type('application/json')
      .send();
    return;
  }

  next();
}

apiRouter.use('/v1/userinfo', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const user = WebServer.getUser(req);
      res
        .status(200)
        .type('application/json')
        .send({
          id: user.getId(),
          displayName: user.getDisplayName()
        });
    }
  });
});

apiRouter.use('/v1/file/list', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: async () => {
      const user = WebServer.getUser(req);

      let requestedPath = req.query.path;
      if (typeof requestedPath !== 'string') {
        requestedPath = '/';
      }

      const requestedDirectory = user.getDefaultFileSystem().getFile(requestedPath);
      if (!(await requestedDirectory.exists())) {
        res
          .status(204)
          .type('application/json')
          .send({ error: 'Requested path does not exist.' });
        return;
      }

      if (!(await requestedDirectory.isDirectory())) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Requested path is not a directory.' });
        return;
      }

      const userFiles = await requestedDirectory.getFiles();
      const directoryNames: string[] = [];

      const files: { name: string, mimeType?: string, isDirectory: boolean }[] = [];
      for (const file of userFiles) {
        const isDirectory = await file.isDirectory();
        if (isDirectory) {
          directoryNames.push(file.getName());
        }

        files.push({
          name: file.getName(),
          mimeType: isDirectory ? undefined : (await file.getMimeType() ?? undefined),
          isDirectory: isDirectory
        });
      }

      files.sort((a, b) => {
        if (directoryNames.includes(a.name) && !directoryNames.includes(b.name)) {
          return -1;
        }
        if (!directoryNames.includes(a.name) && directoryNames.includes(b.name)) {
          return 1;
        }
        return getFileNameCollator().compare(a.name, b.name);
      });

      res
        .status(200)
        .type('application/json')
        .send({
          path: requestedDirectory.getPath(),
          files
        });
    }
  });
});

apiRouter.use('/v1/file/get', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: async () => {
      const user = WebServer.getUser(req);

      let requestedPath = req.query.path;
      if (typeof requestedPath !== 'string') {
        requestedPath = '/';
      }

      const requestedFile = user.getDefaultFileSystem().getFile(requestedPath);
      if (!(await requestedFile.exists())) {
        res
          .status(204)
          .type('application/json')
          .send();
        return;
      }
      if (await requestedFile.isDirectory()) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Requested path is a directory.' });
        return;
      }

      await Utils.sendFileRespectingRequestedRange(req, res, next, requestedFile, await requestedFile.getMimeType() ?? 'application/octet-stream');
    }
  });
});

apiRouter.use('/v1/video-analysis', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: async (): Promise<void> => {
      const user = WebServer.getUser(req);

      const requestedPath = req.query.path;
      if (typeof requestedPath != 'string' || requestedPath.trim().length <= 0) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid path parameter.' });
        return;
      }
      if (!requestedPath.startsWith('/')) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Requested path must be absolute.' });
        return;
      }

      const analyseVideo = async (video: IUserFile): Promise<VideoAnalysisResult> => {
        const videoAnalysis = await VideoAnalyser.analyze(video.getAbsolutePathOnHost()!, true);
        const chapters = videoAnalysis.chapters.map(chapter => ({
          start: chapter.start,
          end: chapter.end,
          tags: chapter.tags
        }));
        const streams = videoAnalysis.streams.map(stream => ({
          index: stream.index,
          codecType: stream.codecType,
          codecNameLong: stream.codecNameLong,
          tags: stream.tags,
          disposition: stream.disposition ?? {}
        }));

        return {
          filePath: video.getPath(),
          fileName: video.getName(),
          formatNameLong: videoAnalysis.file.formatNameLong,
          probeScore: videoAnalysis.file.probeScore,
          duration: videoAnalysis.file.duration,

          tags: videoAnalysis.file.tags,
          chapters,
          streams
        };
      };

      const requestedFile = user.getDefaultFileSystem().getFile(requestedPath);
      if (!(await requestedFile.exists())) {
        res
          .status(404)
          .type('application/json')
          .send({ error: 'Requested file does not exist.' });
        return;
      }

      const result: { files: VideoAnalysisResult[] } = { files: [] };
      if (await requestedFile.isDirectory()) {
        for (const file of (await requestedFile.getFiles())) {
          if ((await file.getMimeType())?.startsWith('video/') ?? false) {
            result.files.push(await analyseVideo(file));
          }
        }
      } else {
        result.files.push(await analyseVideo(requestedFile));
      }

      result.files.sort((a, b) => getFileNameCollator().compare(a.fileName, b.fileName));

      res
        .status(200)
        .type('application/json')
        .send(result);
    }
  });
});

apiRouter.use('/v1/write-video-tags', requireAuthMiddleware, express.json(), (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    post: async (): Promise<void> => {
      const user = WebServer.getUser(req);

      const requestedFilePath = req.body.filePath;
      if (typeof requestedFilePath != 'string' || requestedFilePath.trim().length <= 0) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid or missing filePath.' });
        return;
      }
      if (!requestedFilePath.startsWith('/')) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Requested path must be absolute.' });
        return;
      }

      const fileTags = req.body.fileTags;
      if (typeof fileTags != 'object' || fileTags == null || Array.isArray(fileTags)) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid or missing fileTags.' });
        return;
      }
      for (const fileTagsKey in fileTags) {
        if (!fileTags.hasOwnProperty(fileTagsKey) || typeof fileTags[fileTagsKey] != 'string') {
          res
            .status(400)
            .type('application/json')
            .send({ error: `Invalid fileTagValue for key ${fileTagsKey}.` });
          return;
        }
      }

      const streamTags = req.body.streamTags;
      if (typeof streamTags != 'object' || streamTags == null || Array.isArray(streamTags)) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid or missing streamTags.' });
        return;
      }
      for (const streamIndex in streamTags) {
        if (!streamTags.hasOwnProperty(streamIndex) || !StringUtils.isNumeric(streamIndex)) {
          res
            .status(400)
            .type('application/json')
            .send({ error: `Invalid key type/value for streamIndex: ${streamIndex}` });
          return;
        }

        const streamTagsForStream = streamTags[streamIndex];
        if (typeof streamTagsForStream != 'object' || streamTagsForStream == null || Array.isArray(streamTagsForStream)) {
          res
            .status(400)
            .type('application/json')
            .send({ error: `Invalid streamTags for streamIndex ${streamIndex}.` });
          return;
        }
      }

      const streamDispositions = req.body.streamDispositions;
      if (typeof streamDispositions != 'object' || streamDispositions == null || Array.isArray(streamDispositions)) {
        res
          .status(400)
          .type('application/json')
          .send({ error: 'Invalid or missing streamDispositions.' });
        return;
      }
      for (const streamIndex in streamDispositions) {
        if (!streamTags.hasOwnProperty(streamIndex) || !StringUtils.isNumeric(streamIndex)) {
          res
            .status(400)
            .type('application/json')
            .send({ error: `Invalid key type/value for streamIndex: ${streamIndex}` });
          return;
        }

        const streamDispositionsForStream = streamDispositions[streamIndex];
        if (typeof streamDispositionsForStream != 'object' || streamDispositionsForStream == null || Array.isArray(streamDispositionsForStream)) {
          res
            .status(400)
            .type('application/json')
            .send({ error: `Invalid streamDispositions for streamIndex ${streamIndex}.` });
          return;
        }

        for (const dispositionKey in streamDispositionsForStream) {
          if (!streamDispositionsForStream.hasOwnProperty(dispositionKey) || (streamDispositionsForStream[dispositionKey] !== 1 && streamDispositionsForStream[dispositionKey] !== 0)) {
            res
              .status(400)
              .type('application/json')
              .send({ error: `Invalid dispositionValue for key ${dispositionKey}.` });
            return;
          }
        }
      }

      const videoFile = user.getDefaultFileSystem().getFile(requestedFilePath);

      const originalVideoAnalysis = await VideoAnalyser.analyze(videoFile.getAbsolutePathOnHost()!, true);
      const expectedResultVideoAnalysis: ExtendedVideoAnalysis = {
        file: {
          ...originalVideoAnalysis.file,
          tags: fileTags
        },
        chapters: originalVideoAnalysis.chapters,
        streams: originalVideoAnalysis.streams.map(stream => {
          return {
            ...stream,
            tags: streamTags[stream.index] ?? stream.tags
          };
        })
      };

      const performWriteAndValidations = async (backgroundTaskId: string): Promise<{ statusCode: number, body: unknown /* FIXME */ }> => {
        TaskStorage.setAdditionalTaskProgressInfo(backgroundTaskId, {
          text: 'Writing changes into copy of original file…'
        });

        const videoFilePathWithAppliedTags = await VideoTagWriter.writeTagsIntoNewFile(videoFile.getAbsolutePathOnHost()!, fileTags, streamTags, streamDispositions, (metrics) => {
          let progressText = 'Writing changes into copy of original file…';
          if (metrics.time) {
            progressText += `\nCurrently at ${metrics.time}`;

            if (metrics.speed) {
              progressText += ` (${metrics.speed}x speed)`;
            }
          }

          TaskStorage.setAdditionalTaskProgressInfo(backgroundTaskId, { text: progressText });
        });
        TaskStorage.setAdditionalTaskProgressInfo(backgroundTaskId, { text: 'Analyzing and comparing original file with written changes…' });

        const actualResultVideoAnalysis = await VideoAnalyser.analyze(videoFilePathWithAppliedTags, true);

        function getNormalizedAnalysisForCompare(analysis: ExtendedVideoAnalysis): { [key: string]: any } {
          const result: { [key: string]: any } = JSON.parse(JSON.stringify(analysis));
          delete result.file.fileName;
          delete result.file.size;

          // No idea but ffmpeg changes bitRate/duration sometimes (maybe it 'knows better'?)
          delete result.file.bitRate;
          delete result.file.duration;

          delete result.file.tags;
          for (const stream of result.streams) {
            delete stream.tags;
            delete stream.disposition;

            // No idea but ffmpeg changes duration(-Ts) sometimes (maybe it 'knows better'?)
            delete stream.duration;
            delete stream.durationTs;
          }

          return result;
        }

        function getNormalizedTagsFromAnalysis(analysis: ExtendedVideoAnalysis): { file: { [key: string]: string }, streams: { [key: string]: string }[] } {
          const getNormalizedTags = (tags: { [key: string]: string }): { [key: string]: string } => {
            const normalizedTags: { [key: string]: string } = {};
            for (const tagKey in Object.keys(tags).sort(getFileNameCollator().compare)) {
              if (!tags.hasOwnProperty(tagKey)) {
                continue;
              }
              if (tagKey.toLowerCase() === 'encoder') {
                continue;
              }
              if (normalizedTags[tagKey.toLowerCase()] != null) {
                throw new Error(`Duplicate tag key '${tagKey}' in tags – This is not supported right now: ${JSON.stringify(tags)}`);
              }
              normalizedTags[tagKey.toLowerCase()] = tags[tagKey];
            }
            return normalizedTags;
          };

          return {
            file: getNormalizedTags(analysis.file.tags),
            streams: analysis.streams.map(stream => getNormalizedTags(stream.tags))
          };
        }

        if (JSON.stringify(getNormalizedAnalysisForCompare(actualResultVideoAnalysis)) !== JSON.stringify(getNormalizedAnalysisForCompare(expectedResultVideoAnalysis))) {
          const errorMessage = 'Unexpected mismatch when comparing the expected and actual written changes – Original file was kept unchanged.';
          TaskStorage.setAdditionalTaskProgressInfo(backgroundTaskId, { progress: 1.0, text: errorMessage });

          await Fs.promises.unlink(videoFilePathWithAppliedTags);

          return {
            statusCode: 500,
            body: {
              error: errorMessage,
              expected: getNormalizedAnalysisForCompare(expectedResultVideoAnalysis),
              actual: getNormalizedAnalysisForCompare(actualResultVideoAnalysis)
            }
          };
        }

        const actualTags = getNormalizedTagsFromAnalysis(actualResultVideoAnalysis);
        const expectedTags = getNormalizedTagsFromAnalysis(expectedResultVideoAnalysis);
        if (JSON.stringify(actualTags) !== JSON.stringify(expectedTags)) {
          const errorMessage = 'Unexpected mismatch when comparing the expected and actual written tags – Original file was kept unchanged.';
          TaskStorage.setAdditionalTaskProgressInfo(backgroundTaskId, { progress: 1.0, text: errorMessage });

          await Fs.promises.unlink(videoFilePathWithAppliedTags);

          return {
            statusCode: 500,
            body: {
              error: errorMessage,
              expected: expectedTags,
              actual: actualTags
            }
          };
        }

        TaskStorage.setAdditionalTaskProgressInfo(backgroundTaskId, { progress: 1.0, text: 'Finishing up…' });

        // TODO: Delete left-over empty dir on success/error (maybe move tmp-dir control into this file?)
        await Fs.promises.rename(videoFilePathWithAppliedTags, videoFile.getAbsolutePathOnHost()!);

        return {
          statusCode: 200,
          body: {
            success: true,
            newVideoAnalysis: {
              filePath: videoFile.getPath(),
              fileName: videoFile.getName(),
              formatNameLong: actualResultVideoAnalysis.file.formatNameLong,
              probeScore: actualResultVideoAnalysis.file.probeScore,
              duration: actualResultVideoAnalysis.file.duration,

              tags: actualResultVideoAnalysis.file.tags,
              chapters: actualResultVideoAnalysis.chapters.map(chapter => ({
                start: chapter.start,
                end: chapter.end,
                tags: chapter.tags
              })),
              streams: actualResultVideoAnalysis.streams.map(stream => ({
                index: stream.index,
                codecType: stream.codecType,
                codecNameLong: stream.codecNameLong,
                tags: stream.tags,
                disposition: stream.disposition ?? {}
              }))
            } satisfies VideoAnalysisResult
          }
        };
      };

      const backgroundTask = CompletableTask.create(performWriteAndValidations);

      res
        .status(202)
        .send({
          taskId: backgroundTask.taskId,
          taskStatusUri: `/api/v1/task-status?taskId=${encodeURIComponent(backgroundTask.taskId)}`
        });
    }
  });
});

apiRouter.use('/v1/task-status', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: async (): Promise<void> => {
      const requestedTaskId = req.query.taskId;
      if (typeof requestedTaskId != 'string' || requestedTaskId.trim().length <= 0) {
        res
          .status(400)
          .type('application/json')
          .send({ error: `Invalid or missing query parameter 'taskId'` });
        return;
      }

      const backgroundTask = TaskStorage.getTask(requestedTaskId);
      if (backgroundTask == null) {
        res
          .status(404)
          .type('application/json')
          .send({ error: `No task with id '${requestedTaskId}' found` });
        return;
      }

      if (typeof backgroundTask.owningUser == 'number' && backgroundTask.owningUser != WebServer.getUser(req).getId()) {
        res
          .status(403)
          .type('application/json')
          .send({ error: `Task with id '${requestedTaskId}' is owned by another user` });
        return;
      }

      if (!backgroundTask.hasFinishedExecution()) {
        res
          .status(200)
          .type('application/json')
          .send({
            taskId: backgroundTask.taskId,
            creationTime: backgroundTask.creationTime,
            finished: false,
            progressStats: TaskStorage.getTaskProgressInfo(backgroundTask.taskId),
          });
        return;
      }

      res
        .status(200)
        .type('application/json')
        .send({
          taskId: backgroundTask.taskId,
          creationTime: new Date(backgroundTask.creationTime).toISOString(),
          finished: true,
          progressStats: TaskStorage.getTaskProgressInfo(backgroundTask.taskId),
          result: await backgroundTask.waitForCompletion()
        });
    }
  });
});

apiRouter.use('/', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      res
        .status(404)
        .type('application/json')
        .send({ error: 'Unknown API endpoint' });
    }
  });
});
