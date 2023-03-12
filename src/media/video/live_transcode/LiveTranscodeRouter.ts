import Crypto from 'crypto';
import Express from 'express';
import Path from 'path';
import WebSocket from 'websocket';
import IUserFile from '../../../files/IUserFile';
import NEW_VideoLiveTranscodeTemplate, {
  NEW_VideoLiveTransCodeTemplateData
} from '../../../frontend/NEW_VideoLiveTranscodeTemplate';
import Utils from '../../../Utils';
import WebServer from '../../../webserver/WebServer';
import GstAppProcessWrapper from './GstAppProcessWrapper';
import GstVideoLiveTranscode from './GstVideoLiveTranscode';

type LiveTranscodeSession = { file: IUserFile, websocketClients: WebSocket.connection[], public: false, gstApp: GstAppProcessWrapper, exposedDir?: string };
type LiveTranscodeSessionStorage = { [sessionId: string]: LiveTranscodeSession };

export function createLiveTranscodeRouter(webserver: WebServer): Express.Router {
  const liveTranscodeSessions: LiveTranscodeSessionStorage = {};

  webserver.addListenEventHandler(() => {
    const webSocketServer = webserver.getWebSocketServer();
    if (webSocketServer == null) {
      throw new Error('Websocket server not initialized');
    }

    webSocketServer.on('request', (request) => {
      try {
        // TODO: check valid apollo login

        if (!request.requestedProtocols.includes('live-transcode')) {
          request.reject(400, 'Invalid protocol');
          return;
        }
        if (request.resource.lastIndexOf('/') !== 0) {
          request.reject(400, 'Invalid resource');
          return;
        }

        const sessionId = request.resource.substring(1);
        if (sessionId.length !== 32 || !liveTranscodeSessions.hasOwnProperty(sessionId)) {
          request.reject(400, 'Invalid session id');
          return;
        }

        const liveTranscodeSession = liveTranscodeSessions[sessionId];

        // TODO: Check file ownership and public flag

        const connection = request.accept();
        connection.on('close', () => {
          const index = liveTranscodeSession.websocketClients.indexOf(connection);
          if (index !== -1) {
            liveTranscodeSession.websocketClients.splice(index, 1);
          }
        });
        liveTranscodeSession.websocketClients.push(connection);

        connection.on('message', (message) => {
          if (message.type === 'utf8') {
            console.log('Received message:', message.utf8Data);
          } else if (message.type === 'binary') {
            console.log('Received binary message of ' + message.binaryData.length + ' bytes');
          }
        });

        liveTranscodeSession.gstApp.waitForManifest()
            .then((manifest) => {
              connection.send(JSON.stringify({
                type: 'start',
                manifestUri: `/live_transcode/s/${sessionId}/f/${Path.basename(manifest.path)}`,
                duration: manifest.duration
              }), (err) => {
                if (err) console.error(err);
              });
            });
      } catch (err) {
        console.error(err);
      }
    });
    webSocketServer.on('connect', (connection) => {
      console.log('Websocket connection established:', connection.remoteAddress);
    });
    webSocketServer.on('close', (connection, reasonCode, description) => {
      console.log('Websocket connection closed:', connection.remoteAddress, reasonCode, description);
    });
  });

  const router = Express.Router();

  router.use('/s/:sessionId/f/', (req: Express.Request, res: Express.Response, next) => {
    Utils.restful(req, res, next, {
      get: () => {
        const sessionId = req.params.sessionId;
        if (sessionId.length !== 32 || !liveTranscodeSessions.hasOwnProperty(sessionId)) {
          res.status(400)
              .send('Invalid session id');
          return;
        }
        // TODO: Access checks

        const liveTranscodeSession = liveTranscodeSessions[sessionId];
        if (liveTranscodeSession.exposedDir == null) {
          res.status(404)
              .send('File not found');
          return;
        }

        const requestedFile = Path.resolve(liveTranscodeSession.exposedDir + '/' + decodeURI(req.path));
        if (!requestedFile.startsWith(liveTranscodeSession.exposedDir)) {
          res.status(404)
              .send('File not found');
          return;
        }

        res.sendFile(requestedFile);
      }
    });
  });

  router.use('/s/:sessionId', (req: Express.Request, res: Express.Response, next) => {
    Utils.restful(req, res, next, {
      get: () => {
        const sessionId = req.params.sessionId;
        if (sessionId.length !== 32 || !liveTranscodeSessions.hasOwnProperty(sessionId)) {
          res.status(400)
              .send('Invalid session id');
          return;
        }
        // TODO: Access checks

        const liveTranscodeSession = liveTranscodeSessions[sessionId];
        res.send(generateLiveTranscodeHtml(sessionId, liveTranscodeSession, req));
      }
    });
  });

  router.use('/f/', (req: Express.Request, res: Express.Response, next) => {
    Utils.restful(req, res, next, {
      get: async (): Promise<void> => {
        const user = WebServer.getUser(req);
        const fileSystem = user.getDefaultFileSystem();

        const requestedFilePath = decodeURI(req.path);
        const file = await fileSystem.getFile(requestedFilePath);

        if (!(await file.exists())) {
          res.status(404)
              .send('File not found');
        }

        let sessionId = findSessionIdForFile(file, liveTranscodeSessions);
        if (sessionId == null) {
          while (sessionId == null || liveTranscodeSessions[sessionId] != null) {
            sessionId = Crypto.randomBytes(16).toString('hex');
          }

          const videoFileAbsolutePath = file.getAbsolutePathOnHost();
          if (videoFileAbsolutePath == null) {
            throw new Error('File does not exist on host file system');
          }

          const liveTranscodeCwd = await user.getTmpFileSystem().createTmpDir('gst_live_transcode-');
          const liveTranscodeCwdAbsolutePath = liveTranscodeCwd.getAbsolutePathOnHost();
          if (liveTranscodeCwdAbsolutePath == null) {
            throw new Error('CWD does not exist on host file system');
          }

          const gstLiveTranscode = await GstVideoLiveTranscode.startTranscode(videoFileAbsolutePath, liveTranscodeCwdAbsolutePath);
          liveTranscodeSessions[sessionId] = {file, websocketClients: [], gstApp: gstLiveTranscode, public: false};
          gstLiveTranscode.waitForManifest().then((manifest) => {
            liveTranscodeSessions[sessionId!].exposedDir = Path.dirname(manifest.path);
          });
        }

        const session = liveTranscodeSessions[sessionId];
        res.send(generateLiveTranscodeHtml(sessionId, session, req));
      }
    });
  });

  return router;
}

function findSessionIdForFile(file: IUserFile, sessions: LiveTranscodeSessionStorage): string | null {
  for (const sessionId in sessions) {
    if (sessions[sessionId].file.equals(file)) {
      return sessionId;
    }
  }

  return null;
}

function generateLiveTranscodeHtml(sessionId: string, session: LiveTranscodeSession, req: Express.Request): string {
  const videoLiveTranscodeData: NEW_VideoLiveTransCodeTemplateData = {
    sessionId,

    videoFileName: '',
    videoFrontendUrl: '',
    aliasToken: '',

    manifestFileName: '',
    manifestMimeType: 'application/x-mpegURL',
    chapters: [],

    debug: {
      streams: []
    }
  };

  return new NEW_VideoLiveTranscodeTemplate().render(req, videoLiveTranscodeData);
}

//   /*
//     Quality targets for the future:
//     * Similar To Source (not exactly the same but fps, resolution, bitrate, etc. should be the same)
//     * 1080p (12M)
//     * 1080p (10M)
//     * 1080p (8M)
//     * 720p (4M)
//     * 720p (3M)
//     * 720p (2M)
//     * 480p (1.5M)
//    */
//   // const preferredAudioLanguages = ['jpn', 'ger', 'deu', 'eng'];
//   // const preferredSubtitleLanguages = ['ger', 'deu', 'eng'];
//
//   const analyzedVideo = await VideoAnalyser.analyze(inputFileAbsolutePath, true);
//
//   const chapters: { label: string, start: number }[] = [];
//   for (const chapter of analyzedVideo.chapters) {
//     chapters.push({
//       label: chapter.tags.title ?? '',
//       start: parseInt(chapter.startTime)
//     });
//   }
//
//   const streamsToTranscode: Stream[] = [];
//
//   const videoStream = analyzedVideo.streams.find(s => s.codecType == 'video');
//   if (videoStream == null) {
//     throw new Error('No video stream found');
//   }
//   streamsToTranscode.push(videoStream);
//
//   const audioStreams = analyzedVideo.streams.filter(s => s.codecType == 'audio');
//   audioStreams.sort((a, b) => {
//     if (a.tags.language == 'jpn' && b.tags.language != 'jpn') {
//       return -1;
//     }
//     if (a.tags.language != 'jpn' && b.tags.language == 'jpn') {
//       return 1;
//     }
//
//     return 0;
//   });
//   if (audioStreams.length <= 0) {
//     throw new Error('No audio stream found');
//   }
//   streamsToTranscode.push(...audioStreams);
//
//   const subtitleStreams = analyzedVideo.streams.filter(s => s.codecType == 'subtitle');
//   if (subtitleStreams.length > 0) {
//     streamsToTranscode.push(...subtitleStreams);
//   }
