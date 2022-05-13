import * as Archiver from 'archiver';
import ChildProcess from 'child_process';
import Crypto from 'crypto';
import express from 'express';
import * as fastDirectorySize from 'fast-directory-size';
import Fs from 'fs';
import Path from 'path';
import sharp from 'sharp';
import AbstractUser from '../../AbstractUser';
import { getConfig, getFileNameCollator } from '../../Constants';
import IUserFile from '../../files/IUserFile';
import FileSearch from '../../FileSearch';
import { BreadcrumbItem, FileIcon, FilesTemplate, FilesTemplateData } from '../../frontend/FilesTemplate';
import UrlBuilder from '../../frontend/UrlBuilder';
import VideoLiveTranscodeTemplate from '../../frontend/VideoLiveTranscodeTemplate';
import VideoAnalyser from '../../media/video/analyser/VideoAnalyser';
import VideoLiveTranscode from '../../media/video/live_transcode/VideoLiveTranscode';
import ThumbnailGenerator from '../../ThumbnailGenerator';
import Utils from '../../Utils';
import { registerAliasHandler } from '../AliasRouter';
import WebServer from '../WebServer';

type FileRequestType = 'thumbnail' | 'download' | 'search' | 'live_transcode' | 'webttv_thumbnails';
const allowedFileRequestTypes = ['thumbnail', 'download', 'search', 'live_transcode', 'webttv_thumbnails'];  // Needs to be identical to FileRequestType

export function filesHandleGet(req: express.Request, res: express.Response, frontendType: 'browse' | 'trash'): () => Promise<void> {
  return async () => {
    if (req.query.type != null && (typeof req.query.type != 'string' || !allowedFileRequestTypes.includes(req.query.type))) {
      res.status(400)
          .send('Invalid type requested');
      return;
    }

    const fileRequestType = req.query.type as FileRequestType | undefined;

    const user = WebServer.getUser(req);
    const fileSystem = frontendType == 'browse' ? user.getDefaultFileSystem() : user.getTrashBinFileSystem();

    const requestedFilePath = decodeURI(req.path);
    const file = await fileSystem.getFile(requestedFilePath);

    if (!(await file.exists())) {
      if (file.getPath() != '/') {
        console.debug(`User '${user.getDisplayName()}' requested non-existent file '${requestedFilePath}'`);
        res.status(404)
            .send('File not found');
        return;
      }

      await fileSystem.acquireLock(req, file, (writeableFile) => writeableFile.mkdir({recursive: true}));
    }

    if (await file.isDirectory()) {
      await handleDirectoryRequest(req, res, user, file, frontendType, fileRequestType);
      return;
    }

    if (await file.isFile()) {
      await handleFileRequest(req, res, user, file, fileRequestType);
      return;
    }

    console.debug(`User '${user.getDisplayName()}' requested unknown file '${requestedFilePath}'`);
    res.status(500)
        .type('text/plain')
        .send('Unknown file type\n\n' + JSON.stringify(file, null, 2));
  };
}

async function handleDirectoryRequest(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile, type: 'browse' | 'trash', fileRequestType?: FileRequestType): Promise<void> {
  if (fileRequestType === 'thumbnail') {
    res.status(400)
        .send('Cannot generate thumbnail for directory');
    return;
  }

  if (fileRequestType === 'live_transcode') {
    res.status(400)
        .send('Cannot start live transcoding for directory');
    return;
  }

  if (!req.path.endsWith('/')) {
    res.redirect(req.originalUrl + '/');  // FIXME: Does not work with query params
    return;
  }

  if (fileRequestType === 'search') {
    if (typeof req.query.search != 'string' || req.query.search.length == 0) {
      res.status(400)
          .send('Invalid search query');
      return;
    }

    const searchResult = await FileSearch.searchFile(file, req.query.search);
    await sendDirectoryView(req, res, type, null, searchResult);
    return;
  }

  if (fileRequestType === 'download') {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${Utils.tryReplacingBadCharactersForFileName(file.getName())}.zip"`);

    const zip = Archiver.create('zip', {store: true, forceZip64: true});
    zip.pipe(res);


    res.on('close', () => {
      zip.abort();
      zip.end();
    });
    zip.on('close', () => {
      res.end();
    });

    const absolutePathOnHost = file.getAbsolutePathOnHost();
    if (absolutePathOnHost == null) {
      res.status(500)
          .send('Cannot download the given directory as it does not exist on the host');
      return;
    }

    zip.directory(absolutePathOnHost, file.getName());
    await zip.finalize();

    return;
  }

  console.debug(`User '${user.getDisplayName()}' requested directory '${file.getPath()}'`);

  const files = await file.getFiles();
  await sendDirectoryView(req, res, type, file, files);
}

async function sendDirectoryView(req: express.Request, res: express.Response, type: 'browse' | 'trash', requestedFile: IUserFile | null, files: IUserFile[]): Promise<void> {
  const directoryFiles: IUserFile[] = [];
  for (const innerFile of files) {
    if (await innerFile.isDirectory()) {
      directoryFiles.push(innerFile);
    }
  }

  files.sort((a, b) => {
    if (directoryFiles.includes(a) && !directoryFiles.includes(b)) {
      return -1;
    }
    if (!directoryFiles.includes(a) && directoryFiles.includes(b)) {
      return 1;
    }

    return getFileNameCollator().compare(a.getName(), b.getName());
  });

  const filesToRender: FilesTemplateData['files'] = [];
  for (const innerFile of files) {
    const innerFileMimeType = await innerFile.getMimeType();
    const innerFileStat = await innerFile.stat();

    let fileIcon: FileIcon = 'folder';

    if (innerFileStat.isFile()) {
      fileIcon = 'insert_drive_file';

      if (innerFileMimeType != null) {
        if (innerFileMimeType.startsWith('image/')) {
          fileIcon = 'image';
        } else if (innerFileMimeType == 'application/pdf') {
          fileIcon = 'picture_as_pdf'; // FIXME: The icon is not for a file but too generic
        } else if (innerFileMimeType == 'application/json') {
          fileIcon = 'data_object'; // FIXME: The icon is not for a file but too generic
        } else if (['text/xml', 'text/html'].includes(innerFileMimeType)) {
          fileIcon = 'code';  // FIXME: The icon is not for a file but too generic
        } else if (innerFileMimeType == 'application/zip') {
          fileIcon = 'folder_zip';
        } else if (innerFileMimeType.startsWith('audio/')) {
          fileIcon = 'audio_file';
        } else if (innerFileMimeType.startsWith('text/')) {
          fileIcon = 'description';
        } else if (innerFileMimeType.startsWith('video/')) {
          fileIcon = 'video_file';
        }
      }
    }

    filesToRender.push({
      icon: fileIcon,
      name: innerFile.getName(),
      owner: 'Ich',
      lastChanged: innerFileStat.mtime,
      size: Utils.prettifyFileSize(innerFileStat.isFile() ? innerFileStat.size : await fastDirectorySize.getDirectorySize(innerFile.getAbsolutePathOnHost() as string)),
      mimeType: innerFileMimeType,

      frontendUrl: await UrlBuilder.buildUrl(innerFile, innerFileStat)
    });
    // responseStr += `<li><a class="${innerFileStat.isFile() ? 'hoverable' : ''}" href="${}">${innerFile.getName()}</a> (${innerFileStat.isFile() ? innerFileMimeType : 'Directory'}; ${Utils.prettifyFileSize(innerFileStat.isFile() ? innerFileStat.size : await fastDirectorySize.getDirectorySize(innerFile.getAbsolutePathOnHost() as string))})<div class="hover-box"><img width="256px" height="256px" ${innerFileStat.isFile() ? '' : 'disabled-'}src="${Path.join(req.originalUrl, encodeURIComponent(innerFile.getName()))}?type=thumbnail"></div></li>`;
  }

  const totalStorageUsage = requestedFile ? Utils.prettifyFileSize(await requestedFile.getFileSystem().getSize()) : -1;

  res.type('text/html')
      .send(new FilesTemplate(type).render(req,
          {
            // lastFavoriteFiles: [
            //   {
            //     favorite: true,
            //     icon: 'folder',
            //     title: 'Rule34Lol',
            //     subtitle: 'Shared by Dad',
            //     previewImg: {
            //       src: 'https://image.gala.de/22471682/t/IM/v2/w960/r1.5/-/07--reichster-mann-der-welt-jetzt-noch-reicher---3-2---spoton-article-1001549.jpg',
            //       alt: 'Daddy Bezos'
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'music_note',
            //     title: 'Last Cup of Coffee',
            //     subtitle: 'Lilypichu',
            //     previewImg: {
            //       src: 'https://i.ytimg.com/vi/hF0I9h7C4A4/maxresdefault.jpg',
            //       alt: 'Lilypichu'
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'music_note',
            //     title: 'Getting Naked, a...',
            //     subtitle: 'AJJ',
            //     previewImg: {
            //       src: 'https://emby.media/community/uploads/inline/355992/5c1cc71abf1ee_genericcoverart.jpg',
            //       alt: 'Generic music cover'
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'picture_as_pdf',
            //     title: 'The microarchit...',
            //     subtitle: 'Shared by Florian',
            //     previewImg: {
            //       src: 'https://media.idownloadblog.com/wp-content/uploads/2016/07/Split-PDF-Document-PDF-splitting-guide-6.png',
            //       alt: 'PDF file preview image'
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'image',
            //     title: 'Screenshot 202...',
            //     subtitle: null,
            //     previewImg: {
            //       src: 'https://images.ctfassets.net/lzny33ho1g45/70nrt3lSU8Tcq3lEZX0vz6/3412e1ca73b3834866a640757ea8620f/How_to_edit_a_screenshot',
            //       alt: 'Preview image for \'Screenshot 2020.png\''
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'insert_drive_file',
            //     title: 'main.cpp',
            //     subtitle: null,
            //     previewImg: {
            //       src: '/tmp/cpp_file_thumbnail_tmp.png',
            //       alt: 'Generic file template for file extension \'cpp\''
            //     }
            //   }
            // ],
            // recentFiles: [
            //   {
            //     favorite: false,
            //     icon: 'music_note',
            //     title: 'Looser',
            //     subtitle: 'Neoni',
            //     previewImg: {
            //       src: 'https://i.scdn.co/image/ab67616d0000b273c25d98640e08bddc0c90d229',
            //       alt: 'Neoni'
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'folder',
            //     title: 'Rule34Lol',
            //     subtitle: 'Shared by Dad',
            //     previewImg: {
            //       src: 'https://image.gala.de/22471682/t/IM/v2/w960/r1.5/-/07--reichster-mann-der-welt-jetzt-noch-reicher---3-2---spoton-article-1001549.jpg',
            //       alt: 'Daddy Bezos'
            //     }
            //   },
            //   {
            //     favorite: false,
            //     icon: 'insert_drive_file',
            //     title: 'executable.jar',
            //     subtitle: null,
            //     previewImg: {
            //       src: '/tmp/java_file_thumbnail_tmp.png',
            //       alt: 'Generic file template for file extension \'jar\''
            //     }
            //   },
            //   {
            //     favorite: true,
            //     icon: 'music_note',
            //     title: 'Last Cup of Coffee',
            //     subtitle: 'Lilypichu',
            //     previewImg: {
            //       src: 'https://i.ytimg.com/vi/hF0I9h7C4A4/maxresdefault.jpg',
            //       alt: 'Lilypichu'
            //     }
            //   },
            //   {
            //     favorite: false,
            //     icon: 'picture_as_pdf',
            //     title: 'Ausbildungsve...',
            //     subtitle: null,
            //     previewImg: {
            //       src: 'https://acrobatusers.com/assets/uploads/actions/pdf_accessibility1_0.jpeg',
            //       alt: 'PDF file preview image'
            //     }
            //   },
            //   {
            //     favorite: false,
            //     icon: 'folder',
            //     title: 'Ausbildungsna...',
            //     subtitle: null,
            //     previewImg: {
            //       src: 'https://confluence.atlassian.com/doc/files/375849180/1005333668/1/1589961913264/pdf-view.png',
            //       alt: 'Directory preview for \'Ausbildungsnachweise\''
            //     }
            //   }],

            lastFavoriteFiles: [],
            recentFiles: [],
            banners: totalStorageUsage >= 0 ? [
              {type: 'info', msg: `Aktueller Gesamtverbrauch: ${totalStorageUsage}`, dismissible: false}
            ] : [],
            files: filesToRender,
            breadcrumbs: requestedFile ? await generateBreadcrumbs(requestedFile) : []
          }
      ));

  // let responseStr = `${file.getPath() == '/' ? '' : `<a href="${encodeURI(Path.dirname(decodeURI(req.originalUrl)))}">Go up to ${Path.dirname(file.getPath())}</a>`}` +
  //     `` +
  //     `<form method="post"><input name="action" type="hidden" value="${new CreateFilePostActionHandler(false).getActionKey()}"><input name="value" placeholder="Dateiname" type="text" required><button type="submit">Create file</button></form>` +
  //     `<form method="post"><input name="action" type="hidden" value="${new CreateFilePostActionHandler(true).getActionKey()}"><input name="value" placeholder="Ordnername" type="text" required><button type="submit">Create directory</button></form>` +
  //     `<form method="post" enctype="multipart/form-data"><input name="action" type="hidden" value="${new FileUploadPostActionHandler().getActionKey()}"><input name="value" type="file" required multiple><button type="submit">Upload file</button></form>` +
  //     '<ul>';
}

async function handleFileRequest(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile, fileRequestType?: FileRequestType): Promise<void> {
  if (fileRequestType == 'search') {
    res.status(400)
        .type('text/plain')
        .send('Search not available when requesting a file');
    return;
  }

  if (fileRequestType == 'thumbnail') {
    const start = process.hrtime();
    const thumbnail = await new ThumbnailGenerator().generateThumbnail(file);
    const tookMs = (process.hrtime(start)[1] / 1000000).toFixed(2);

    if (thumbnail != null) {
      console.log(`User '${user.getDisplayName()}' successfully requested thumbnail for file '${file.getPath()}' in ${tookMs}ms`);
      res.type(thumbnail.mime)
          .send(thumbnail.data);
      return;
    }

    console.log(`User '${user.getDisplayName()}' failed to generate thumbnail for file '${file.getPath()}' in ${tookMs}ms`);
    res.status(501)
        .send(`Cannot generate thumbnail for given file type (${await file.getMimeType()})`);
    return;
  }

  if (fileRequestType == 'live_transcode') {
    return handleFileLiveTranscodeRequest(req, res, user, file);
  }

  if (fileRequestType == 'webttv_thumbnails') {
    return handleWebVttThumbnailRequest(req, res, user, file);
  }

  console.log(`User '${user.getDisplayName()}' requested file '${file.getPath()}'`);

  res.type(await file.getMimeType() ?? 'text/plain');

  res.setHeader('Accept-Ranges', 'bytes');

  const fileSize = (await file.stat()).size;
  const parsedRange = req.range(fileSize);

  let bytesStart = undefined;
  let bytesEnd = undefined;
  if (Array.isArray(parsedRange)) {
    bytesStart = parsedRange[0].start;
    bytesEnd = parsedRange[0].end;

    if (bytesEnd > fileSize) {
      res.status(416)
          .send(`Requested range not satisfiable (file has ${fileSize} bytes)`);
      return;
    }
  }

  const fileReadStream = file.getReadStream({
    start: bytesStart,
    end: bytesEnd
  });
  fileReadStream.on('error', (err) => {
    console.error(err);

    fileReadStream.destroy();
    res.end();
  });

  res.on('close', () => {
    fileReadStream.destroy();
  });

  if (fileRequestType == 'download') {
    res.setHeader('Content-Disposition', `attachment; filename="${Utils.tryReplacingBadCharactersForFileName(file.getName())}"`);
  }

  res.setHeader('Content-Length', fileSize);
  if (bytesStart != undefined && bytesEnd != undefined) {
    res.status(206);
    res.setHeader('Content-Length', bytesEnd - bytesStart + 1);
    res.setHeader('Content-Range', `bytes ${bytesStart}-${bytesEnd}/${fileSize}`);
  }

  fileReadStream.pipe(res);
}

const liveTranscodeCache: { [key: string]: string } = {};

async function handleFileLiveTranscodeRequest(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile): Promise<void> {
  // FIXME: video player does not support same language streams and only shows first
  /*
    Quality targets for the future:
    * Similar To Source (not exactly the same but fps, resolution, bitrate, etc. should be the same)
    * 1080p (12M)
    * 1080p (10M)
    * 1080p (8M)
    * 720p (4M)
    * 720p (3M)
    * 720p (2M)
    * 480p (1.5M)
   */
  // const preferredAudioLanguages = ['jpn', 'ger', 'deu', 'eng'];
  // const preferredSubtitleLanguages = ['ger', 'deu', 'eng'];

  const inputFileAbsolutePath = file.getAbsolutePathOnHost();
  if (inputFileAbsolutePath == null) {
    throw new Error('File does not exist on host file system');
  }

  if (liveTranscodeCache[inputFileAbsolutePath] != null) {
    res.send(liveTranscodeCache[inputFileAbsolutePath]);
    return;
  }

  const inputStreams = await VideoAnalyser.analyze(inputFileAbsolutePath, true);

  const streamsToTranscode = [];

  const videoStream = inputStreams.streams.find(s => s.codecType == 'video');
  if (videoStream == null) {
    throw new Error('No video stream found');
  }
  streamsToTranscode.push(videoStream);

  let audioStream = inputStreams.streams.find(s => s.codecType == 'audio');
  if (audioStream == null) {
    throw new Error('No audio stream found');
  }
  streamsToTranscode.push(audioStream);

  let subtitleStream = inputStreams.streams.find(s => s.codecType == 'subtitle');
  if (subtitleStream != null) {
    streamsToTranscode.push(subtitleStream);
  }

  const liveDashTranscode = await VideoLiveTranscode.startLiveDashTranscode(user, file, streamsToTranscode);

  const videoFrontendUrl = await UrlBuilder.buildUrl(file);
  const aliasToken = Crypto.createHash('sha256')
      .update('live_transcode')
      .update(inputFileAbsolutePath)
      .digest()
      .toString('hex');

  registerAliasHandler(aliasToken, (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');

    express.static(liveDashTranscode.publicDir)(req, res, next);
  });

  const html = new VideoLiveTranscodeTemplate().render(req, {videoFrontendUrl, aliasToken});
  liveTranscodeCache[inputFileAbsolutePath] = html;
  res.send(html);
}

const webVttThumbnailCache: { [key: string]: string } = {};

async function handleWebVttThumbnailRequest(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile): Promise<void> {
  const SECONDS_BETWEEN_FRAMES: number = 5;

  const inputFileAbsolutePath = file.getAbsolutePathOnHost();
  if (inputFileAbsolutePath == null) {
    throw new Error('File does not exist on host file system');
  }

  if (webVttThumbnailCache[inputFileAbsolutePath] != null) {
    res
        .type('text/vtt')
        .send(webVttThumbnailCache[inputFileAbsolutePath]);
    return;
  }

  const tmpDir = await user.getTmpFileSystem().createTmpDir('webVtt_thumbnails-');
  const cwd = tmpDir.getAbsolutePathOnHost();
  if (cwd == null) {
    throw new Error('cwd is null');
  }

  await Fs.promises.mkdir(Path.join(cwd, 'frames'), {recursive: true});

  const inputFileRelativePath = `input${Path.extname(file.getName())}`;

  await Fs.promises.link(inputFileAbsolutePath, Path.join(cwd, inputFileRelativePath));

  const ffmpegProcess = ChildProcess.spawn('ffmpeg',
      [
        '-hwaccel', 'cuda',
        '-bitexact',
        '-n',
        '-i', inputFileRelativePath,

        '-bt', '20',
        '-vf', `fps=1/${SECONDS_BETWEEN_FRAMES},scale=240:-1`,

        '-f', 'image2',
        'frames/%d.png'
      ],
      {cwd});

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`[OUT] ${data}`);
  });
  ffmpegProcess.stderr.on('data', (data) => {
    console.log(`[ERR] ${data}`);
  });
  ffmpegProcess.on('exit', async (code) => {
    console.log(`ffmpeg process exited with code ${code}`);

    if (code == 0) {
      let frameCount = (await Fs.promises.readdir(Path.join(cwd, 'frames'))).length;

      const ffmpegProcess = ChildProcess.spawn('ffmpeg',
          [
            '-hwaccel', 'cuda',
            '-bitexact',
            '-n',
            '-i', 'frames/%d.png',

            '-vf', `tile=${frameCount}x1`,

            '-f', 'image2',
            'frames.png'
          ],
          {cwd});

      ffmpegProcess.stdout.on('data', (data) => {
        console.log(`[OUT] ${data}`);
      });
      ffmpegProcess.stderr.on('data', (data) => {
        console.log(`[ERR] ${data}`);
      });
      ffmpegProcess.on('exit', async (code) => {
        console.log(`ffmpeg process exited with code ${code}`);

        if (code == 0) {
          const frameMetaData = await sharp(Path.join(cwd, 'frames/1.png')).metadata();

          if (frameMetaData.width == null || frameMetaData.height == null) {
            throw new Error('Failed to get frame dimensions');
          }

          const aliasToken = Crypto.createHash('sha256').update('webttv_thumbnails').update(inputFileAbsolutePath).digest().toString('hex');
          registerAliasHandler(aliasToken, (req, res, next) => {
            if (req.path == '/frames.png') {
              res.sendFile(Path.join(cwd, 'frames.png'));
            } else {
              res.status(404)
                  .send('Not found');
            }
          });

          const imageUrl = new URL(`/alias/${aliasToken}/frames.png`, getConfig().data.baseUrl).href;

          const toWebVttTime = (seconds: number): string => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const seconds2 = Math.floor(seconds % 60);

            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds2.toString().padStart(2, '0')}.000`;
          };

          let webVttContent = 'WEBVTT\n\n';

          for (let i = 0; i < frameCount; ++i) {
            webVttContent += `${toWebVttTime(i * SECONDS_BETWEEN_FRAMES)} --> ${toWebVttTime((i + 1) * SECONDS_BETWEEN_FRAMES)}\n`;
            webVttContent += `${imageUrl}?#xywh=${frameMetaData.width * i},0,${frameMetaData.width},${frameMetaData.height}\n\n`;
          }

          webVttThumbnailCache[inputFileAbsolutePath] = webVttContent;
          await Fs.promises.rm(Path.join(cwd, 'frames'), {recursive: true});

          res.type('text/vtt')
              .send(webVttContent);
        } else {
          res.status(500)
              .send(`ffmpeg process exited with code ${code}`);
        }
      });
    } else {
      res.status(500)
          .send(`ffmpeg process exited with code ${code}`);
    }
  });
}

async function generateBreadcrumbs(file: IUserFile): Promise<BreadcrumbItem[]> {
  const path = file.getPath();
  const pathArgs = file.getPath().split('/');

  if (path.charAt(0) == '/') {
    pathArgs.shift();
  }

  if (path.charAt(path.length - 1) == '/') {
    pathArgs.pop();
  }

  const result: BreadcrumbItem[] = [{
    name: 'root',
    frontendUrl: await UrlBuilder.buildUrl(file.getFileSystem().getFile('/'))
  }];

  let currPath = '/';
  for (const arg of pathArgs) {
    currPath += arg + '/';

    result.push({
      name: arg,
      frontendUrl: await UrlBuilder.buildUrl(file.getFileSystem().getFile(currPath))
    });
  }

  return result;
}
