// import Express from 'express';
// import Fs from 'node:fs';
// import Path from 'node:path';
// import { getFileTypeUtils } from '../../../Constants';
// import NEW_VideoLiveTranscodeTemplate, {
//   NEW_VideoLiveTransCodeTemplateData
// } from '../../../frontend/NEW_VideoLiveTranscodeTemplate';
// import UrlBuilder from '../../../frontend/UrlBuilder';
// import Utils from '../../../Utils';
// import WebServer from '../../../webserver/WebServer';
// import GstVideoLiveTranscode from './gst_app/GstVideoLiveTranscode';
// import LiveTranscodeManifestGenerator from './LiveTranscodeManifestGenerator';
//
//
//
// export function createLiveTranscodeRouter(webserver: WebServer): Express.Router {
//   const router = Express.Router();
//   const playerSessions = new VideoPlayerSessions();
//   LiveTranscodeSocket.attachServer(webserver, playerSessions);
//
//   router.use('/s/:sessionId/f/', (req: Express.Request, res: Express.Response, next) => {
//     Utils.restful(req, res, next, {
//       get: async (): Promise<void> => {
//         const sessionId = req.params.sessionId;
//         const session = playerSessions.find(sessionId);
//         if (session == null) {
//           res.status(400)
//               .send('Invalid session id');
//           return;
//         }
//         // TODO: Access checks
//
//         if (session.exposedDir == null) {
//           res.status(404)
//               .send('File not found');
//           return;
//         }
//
//         const requestedFile = Path.resolve(session.exposedDir + '/' + decodeURI(req.path));
//         if (!requestedFile.startsWith(session.exposedDir) || !Fs.existsSync(requestedFile)) {
//           res.status(404)
//               .send('File not found');
//           return;
//         }
//
//         await Utils.sendFileRespectingRequestedRange(req, res, next, requestedFile, await getFileTypeUtils().getMimeType(requestedFile) ?? 'application/octet-stream');
//       }
//     });
//   });
//
//   router.use('/s/:sessionId', (req: Express.Request, res: Express.Response, next) => {
//     Utils.restful(req, res, next, {
//       get: async (): Promise<void> => {
//         const sessionId = req.params.sessionId;
//         const session = playerSessions.find(sessionId);
//         if (session == null) {
//           res.status(400)
//               .send('Invalid session id');
//           return;
//         }
//         // TODO: Access checks
//
//         res.send(await generateLiveTranscodeHtml(session, req));
//       }
//     });
//   });
//
//   router.use('/f/', (req: Express.Request, res: Express.Response, next) => {
//     Utils.restful(req, res, next, {
//       get: async (): Promise<void> => {
//         const user = WebServer.getUser(req);
//         const fileSystem = user.getDefaultFileSystem();
//
//         const requestedFilePath = decodeURI(req.path);
//         const file = fileSystem.getFile(requestedFilePath);
//
//         if (!(await file.exists())) {
//           res.status(404)
//               .send('File not found');
//           return;
//         }
//
//         let session = playerSessions.findSessionForFile(file);
//         if (session == null) {
//           const videoFileAbsolutePath = file.getAbsolutePathOnHost();
//           if (videoFileAbsolutePath == null) {
//             throw new Error('File does not exist on host file system');
//           }
//
//           const liveTranscodeCwd = await user.getTmpFileSystem().createTmpDir('gst_live_transcode-');
//           const liveTranscodeCwdAbsolutePath = liveTranscodeCwd.getAbsolutePathOnHost();
//           if (liveTranscodeCwdAbsolutePath == null) {
//             throw new Error('CWD does not exist on host file system');
//           }
//
//           const liveTranscodeLiveDir = Path.join(liveTranscodeCwdAbsolutePath, 'public');
//           await Fs.promises.mkdir(liveTranscodeLiveDir);
//
//           const gstLiveTranscode = await GstVideoLiveTranscode.startTranscode(videoFileAbsolutePath, liveTranscodeLiveDir);
//           const manifestGenerator = new LiveTranscodeManifestGenerator(videoFileAbsolutePath, liveTranscodeLiveDir, gstLiveTranscode);
//           session = playerSessions.create(file, manifestGenerator);
//
//           manifestGenerator.generateManifest()
//               .then((manifest) => {
//                 if (!Path.isAbsolute(manifest.publicDir)) {
//                   throw new Error('Manifest public dir is not absolute');
//                 }
//
//                 session!.exposedDir = manifest.publicDir;
//               });
//         }
//
//         res.send(await generateLiveTranscodeHtml(session, req));
//       }
//     });
//   });
//
//   return router;
// }
//
// async function generateLiveTranscodeHtml(session: LiveTranscodeSession, req: Express.Request): Promise<string> {
//   const videoLiveTranscodeData: NEW_VideoLiveTransCodeTemplateData = {
//     sessionId: session.id,
//
//     videoFileName: session.mediaFile.getName(),
//     videoFrontendUrl: await UrlBuilder.buildUrl(session.mediaFile)
//   };
//
//   return new NEW_VideoLiveTranscodeTemplate().render(req, videoLiveTranscodeData);
// }
