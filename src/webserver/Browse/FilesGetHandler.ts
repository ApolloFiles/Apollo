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
  const inputFileAbsolutePath = file.getAbsolutePathOnHost();
  if (inputFileAbsolutePath == null) {
    throw new Error('File does not exist on host file system');
  }

  if (liveTranscodeCache[inputFileAbsolutePath] != null) {
    res.send(liveTranscodeCache[inputFileAbsolutePath]);
    return;
  }

  liveTranscodeCache[inputFileAbsolutePath] = 'Initializing...';

  const tmpDir = await user.getTmpFileSystem().createTmpDir('live_transcode-');
  const cwd = tmpDir.getAbsolutePathOnHost();
  if (cwd == null) {
    throw new Error('cwd is null');
  }

  await Fs.promises.mkdir(Path.join(cwd, 'DASH'), {recursive: true});

  const inputFileRelativePath = `input${Path.extname(file.getName())}`;

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

  // TODO: Automatically adapt output depending on input (no 30 fps if input is 24, no 720p if input is 480p, etc.)
  // TODO: Generate a muted audio stream in output if input has no audio
  // TODO: Audio Track Switch (e.g. for en and de audio)
  // TODO: Do not burn in subtitles if input has no subtitles
  // TODO: Allow subtitles to be chosen/disabled

  await Fs.promises.link(inputFileAbsolutePath, Path.join(cwd, inputFileRelativePath));
  const GOP_SIZE = 100;
  const FPS = 30;
  const ffmpegProcess = ChildProcess.spawn('ffmpeg',
      [
        '-hwaccel', 'cuda',
        '-bitexact',
        '-n',
        '-i', inputFileRelativePath,
        '-map_chapters', '0',
        '-map_metadata', '0',
        // '-c:v', 'libx264',
        '-c:v', 'h264_nvenc',
        '-preset', 'p6',
        '-profile:v', 'high',
        '-tune', 'hq',
        '-rc-lookahead', '8',
        '-bf', '2',
        '-rc', 'vbr',
        '-cq', '26',

        '-keyint_min', GOP_SIZE.toString(),
        '-g', GOP_SIZE.toString(),
        '-sc_threshold', '0',
        '-r', FPS.toString(),
        '-pix_fmt', 'yuv420p',

        '-map', 'v:0',
        '-s:0', '1920x1080',
        '-vf:0', `subtitles=${inputFileRelativePath}`,
        '-b:v:0', '0',
        '-maxrate:0', '120M',
        '-bufsize:0', '240M',

        '-map', '0:a:0',
        '-c:a:0', 'aac',
        '-b:a:0', '128k',
        '-ac:0', '2',
        '-ar:0', '48000',

        // FIXME: video player does not support same language streams and only shows first
        '-map', '0:a:1',
        '-c:a:1', 'aac',
        '-b:a:1', '128k',
        '-ac:1', '2',
        '-ar:1', '48000',

        '-init_seg_name', 'init_$RepresentationID$',
        '-media_seg_name', 'chunk_$RepresentationID$_$Number$',
        '-use_template', '1',
        '-use_timeline', '1',
        '-seg_duration', '2',
        '-streaming', '1',
        '-update_period', '1',
        '-dash_segment_type', 'mp4',
        '-utc_timing_url', 'https://time.akamai.com/?iso',
        '-adaptation_sets', 'id=0,streams=v id=1,streams=1 id=2,streams=2',

        '-f', 'dash',
        'DASH/manifest.mpd'
      ],
      {cwd});

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`[OUT] ${data}`);
  });
  const videoFrontendUrl = await UrlBuilder.buildUrl(file);
  ffmpegProcess.stderr.on('data', async (data) => {
    console.log(`[ERR] ${data}`);

    if (res.headersSent) {
      return;
    }

    const manifestAbsolutePath = Path.join(cwd, 'DASH', 'manifest.mpd');
    if (Fs.existsSync(manifestAbsolutePath)) {
      const manifestContents = await Fs.promises.readFile(manifestAbsolutePath, 'utf-8');

      if (res.headersSent || !manifestContents.trim().endsWith('</MPD>')) {
        return;
      }

      const aliasToken = Crypto.createHash('sha256').update('live_transcode').update(inputFileAbsolutePath).digest().toString('hex');
      registerAliasHandler(aliasToken, (req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');

        express.static(Path.join(cwd, 'DASH'))(req, res, next);
      });

      // language=html
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Dash.js Test</title>

          <link href="/node_modules/video.js/dist/video-js.min.css" rel="stylesheet">
          <link href="https://unpkg.com/pthumbnails@1.2.0/dist/videojs-vtt-thumbnails.css" rel="stylesheet">
          <link href="https://unpkg.com/@samueleastdev/videojs-settings-menu@0.0.9/dist/videojs-settings-menu.css" rel="stylesheet">
        </head>

        <body>
          <div style="height: 80vh">
            <video class="video-js vjs-big-play-centered vjs-fill"
                   poster="${videoFrontendUrl}?type=thumbnail"
                   controls>
              <p class="vjs-no-js">
                To view this video please enable JavaScript,
                and consider upgrading to a web browser that
                <a href="https://videojs.com/html5-video-support/" target="_blank">supports HTML5 video</a>
              </p>
            </video>
          </div>

          <script>window.HELP_IMPROVE_VIDEOJS = false;</script>
          <script src="/node_modules/video.js/dist/video.min.js"></script>
          <script src="https://unpkg.com/videojs-persist@0.1.2/dist/videojs-persist.min.js"></script>
          <script src="https://unpkg.com/videojs-contrib-quality-levels@2.1.0/dist/videojs-contrib-quality-levels.js"></script>
          <script src="https://unpkg.com/@samueleastdev/videojs-dash-hls-bitrate-switcher@1.0.7/dist/videojs-dash-hls-bitrate-switcher.min.js"></script>
          <script src="https://unpkg.com/@samueleastdev/videojs-settings-menu@0.0.9/dist/videojs-settings-menu.min.js"></script>
          <script>
            const VERSION = '1.2.0';

            // Default options for the plugin.
            const defaults = {}

            // Cache for image elements
            var cache = {}

            // Cross-compatibility for Video.js 5 and 6.
            const registerPlugin = videojs.registerPlugin || videojs.plugin
            // const dom = videojs.dom || videojs;

            /**
             * Function to invoke when the player is ready.
             *
             * This is a great place for your plugin to initialize itself. When this
             * function is called, the player will have its DOM and child components
             * in place.
             *
             * @function onPlayerReady
             * @param    {Player} player
             *           A Video.js player object.
             *
             * @param    {Object} [options={}]
             *           A plain object containing options for the plugin.
             */
            const onPlayerReady = (player, options) => {
              player.addClass('vjs-vtt-thumbnails');
              player.vttThumbnails = new vttThumbnailsPlugin(player, options);
            }

            /**
             * A video.js plugin.
             *
             * In the plugin function, the value of \`this\` is a video.js \`Player\`
             * instance. You cannot rely on the player being in a "ready" state here,
             * depending on how the plugin is invoked. This may or may not be important
             * to you; if not, remove the wait for "ready"!
             *
             * @function vttThumbnails
             * @param    {Object} [options={}]
             *           An object of options left to the plugin author to define.
             */
            const vttThumbnails = function (options) {
              this.ready(() => {
                onPlayerReady(this, videojs.mergeOptions(defaults, options))
              })
            }

            /**
             * VTT Thumbnails class.
             *
             * This class performs all functions related to displaying the vtt
             * thumbnails.
             */
            class vttThumbnailsPlugin {

              /**
               * Plugin class constructor, called by videojs on
               * ready event.
               *
               * @function  constructor
               * @param    {Player} player
               *           A Video.js player object.
               *
               * @param    {Object} [options={}]
               *           A plain object containing options for the plugin.
               *           - src: path to the .vtt file
               *           - baseUrl (optional): host prepended to the image definitions
               *           - preloadStrategy (optional): preload images in the cache, for smooth scrubbing (default: none, available: 'all')
               */
              constructor(player, options) {
                this.player = player
                this.options = options
                this.listenForDurationChange();
                this.initializeThumbnails();
                this.registeredEvents = {};
                return this;
              }

              src(source) {
                this.resetPlugin();
                this.options.src = source;
                this.initializeThumbnails();
              }

              detach() {
                this.resetPlugin();
              }

              resetPlugin() {
                this.thumbnailHolder && this.thumbnailHolder.parentNode.removeChild(this.thumbnailHolder);
                this.progressBar && this.progressBar.removeEventListener('mouseenter', this.registeredEvents.progressBarMouseEnter);
                this.progressBar && this.progressBar.removeEventListener('mouseleave', this.registeredEvents.progressBarMouseLeave);
                this.progressBar && this.progressBar.removeEventListener('mousemove', this.registeredEvents.progressBarMouseMove);
                delete this.registeredEvents.progressBarMouseEnter;
                delete this.registeredEvents.progressBarMouseLeave;
                delete this.registeredEvents.progressBarMouseMove;
                delete this.progressBar;
                delete this.vttData;
                delete this.thumbnailHolder;
                delete this.timeHolder;
                delete this.lastStyle;
              }

              listenForDurationChange() {
                this.player.on('durationchange', () => {

                })
              }

              /**
               * Bootstrap the plugin.
               */
              initializeThumbnails() {
                if (!this.options.src) {
                  return
                }
                const baseUrl = this.getBaseUrl()
                const url = this.getFullyQualifiedUrl(this.options.src, baseUrl)
                this.getVttFile(url)
                    .then((data) => {
                      this.vttData = this.processVtt(data)
                      this.setupThumbnailElement()

                      if (this.options.hasOwnProperty('preloadStrategy')) {
                        this.preload(this.vttData)
                      }
                    })
              }

              /**
               * Builds a base URL should we require one.
               *
               * @returns {string}
               */
              getBaseUrl() {
                return [
                  window.location.protocol,
                  '//',
                  window.location.hostname,
                  (window.location.port ? ':' + window.location.port : ''),
                  window.location.pathname
                ].join('').split(/([^\\/]*)$/gi).shift()
              }

              /**
               * Grabs the contents of the VTT file.
               *
               * @param url
               * @returns {Promise}
               */
              getVttFile(url) {
                return new Promise((resolve, reject) => {
                  const req = new XMLHttpRequest()
                  req.data = {
                    resolve: resolve
                  }
                  req.addEventListener('load', this.vttFileLoaded)
                  req.open('GET', url)
                  req.send()
                })
              }

              /**
               * Callback for loaded VTT file.
               */
              vttFileLoaded() {
                this.data.resolve(this.responseText)
              }

              /**
               * This will fill the cache and thus preload images
               */
              preload(data) {
                data.forEach(item => this.setImageInCacheForItem(item))
              }

              setupThumbnailElement(data) {
                const mouseDisplay = this.player.$('.vjs-mouse-display')
                this.progressBar = this.player.$('.vjs-progress-control')
                // thumbnail element
                const thumbHolder = document.createElement('div')
                thumbHolder.setAttribute('class', 'vjs-vtt-thumbnail-display')
                this.progressBar.appendChild(thumbHolder)
                this.thumbnailHolder = thumbHolder
                // time element
                const timeHolder = document.createElement('time')
                timeHolder.setAttribute('class', 'vjs-vtt-thumbnail-time')
                this.thumbnailHolder.appendChild(timeHolder)
                this.timeHolder = timeHolder
                if (mouseDisplay) {
                  mouseDisplay.classList.add('vjs-hidden')
                }
                this.registeredEvents.progressBarMouseEnter = () => {
                  return this.onBarMouseenter()
                };
                this.registeredEvents.progressBarMouseLeave = () => {
                  return this.onBarMouseleave()
                };
                this.progressBar.addEventListener('mouseenter', this.registeredEvents.progressBarMouseEnter)
                this.progressBar.addEventListener('mouseleave', this.registeredEvents.progressBarMouseLeave)
              }

              onBarMouseenter() {
                this.mouseMoveCallback = (e) => {
                  this.onBarMousemove(e)
                }
                this.registeredEvents.progressBarMouseMove = this.mouseMoveCallback;
                this.progressBar.addEventListener('mousemove', this.registeredEvents.progressBarMouseMove)
                this.showThumbnailHolder()
              }

              onBarMouseleave() {
                if (this.registeredEvents.progressBarMouseMove) {
                  this.progressBar.removeEventListener('mousemove', this.registeredEvents.progressBarMouseMove)
                }
                this.hideThumbnailHolder()
              }

              getXCoord(bar, mouseX) {
                const rect = bar.getBoundingClientRect();
                const docEl = document.documentElement;
                return mouseX - (rect.left + (window.pageXOffset || docEl.scrollLeft || 0));
              }

              onBarMousemove(event) {
                this.updateThumbnailStyle(
                    videojs.dom.getPointerPosition(this.progressBar, event).x,
                    this.progressBar.offsetWidth
                )
              }

              setImageInCacheForItem(item) {
                // Cache miss
                if (item.css.url && !cache[item.css.url]) {
                  let image = new Image();
                  image.src = item.css.url;
                  cache[item.css.url] = image;
                }
              }

              getStyleForTime(time) {
                for (let i = 0; i < this.vttData.length; ++i) {
                  let item = this.vttData[i]
                  if (time >= item.start && time < item.end) {
                    this.setImageInCacheForItem(item)

                    return item.css
                  }
                }
              }

              showThumbnailHolder() {
                this.thumbnailHolder.style.opacity = '1'
              }

              hideThumbnailHolder() {
                this.thumbnailHolder.style.opacity = '0'
              }

              updateThumbnailStyle(percent, width) {
                const duration = this.player.duration()
                const time = percent * duration
                const currentStyle = this.getStyleForTime(time)

                let timestamp = new Date(Math.round(time) * 1000).toISOString().substr(11, 8)
                timestamp = duration > 3599 ? timestamp : timestamp.substring(3)
                this.timeHolder.innerText = timestamp

                if (!currentStyle) {
                  return this.hideThumbnailHolder()
                }

                const xPos = percent * width
                const thumbnailWidth = parseInt(this.thumbnailHolder.offsetWidth)
                const halfthumbnailWidth = thumbnailWidth / 2
                const marginRight = width - (xPos + halfthumbnailWidth)
                const marginLeft = xPos - halfthumbnailWidth

                if (marginLeft > 0 && marginRight > 0) {
                  this.thumbnailHolder.style.transform = 'translateX(' + (xPos - halfthumbnailWidth) + 'px)'
                } else if (marginLeft <= 0) {
                  this.thumbnailHolder.style.transform = 'translateX(' + 0 + 'px)'
                } else if (marginRight <= 0) {
                  this.thumbnailHolder.style.transform = 'translateX(' + (xPos + marginRight - halfthumbnailWidth) + 'px)'
                }

                if (this.lastStyle && this.lastStyle === currentStyle) {
                  return
                }
                this.lastStyle = currentStyle

                for (let style in currentStyle) {
                  if (currentStyle.hasOwnProperty(style)) {
                    this.thumbnailHolder.style[style] = currentStyle[style]
                  }
                }
              }

              processVtt(data) {
                const processedVtts = []
                const vttDefinitions = data.split(/[\\r\\n][\\r\\n]/i)
                vttDefinitions.forEach((vttDef) => {
                  if (vttDef.match(/([0-9]{2}:)?([0-9]{2}:)?[0-9]{2}(.[0-9]{3})?( ?--> ?)([0-9]{2}:)?([0-9]{2}:)?[0-9]{2}(.[0-9]{3})?[\\r\\n]{1}.*/gi)) {
                    let vttDefSplit = vttDef.split(/[\\r\\n]/i)
                    let vttTiming = vttDefSplit[0]
                    let vttTimingSplit = vttTiming.split(/ ?--> ?/i)
                    let vttTimeStart = vttTimingSplit[0]
                    let vttTimeEnd = vttTimingSplit[1]
                    let vttImageDef = vttDefSplit[1]
                    let vttCssDef = this.getVttCss(vttImageDef)

                    processedVtts.push({
                      start: this.getSecondsFromTimestamp(vttTimeStart),
                      end: this.getSecondsFromTimestamp(vttTimeEnd),
                      css: vttCssDef
                    })

                  }

                })

                return processedVtts
              }

              getFullyQualifiedUrl(path, base) {
                if (path.indexOf('//') >= 0 || path.indexOf('/') === 0) {
                  // We have a fully qualified path.
                  return path
                }
                if (base.indexOf('//') === 0) {
                  // We don't have a fully qualified path, but need to
                  // be careful with trimming.
                  return [
                    base.replace(/\\/$/gi, ''),
                    this.trim(path, '/')
                  ].join('/')
                }
                if (base.indexOf('//') > 0) {
                  // We don't have a fully qualified path, and should
                  // trim both sides of base and path.
                  return [
                    this.trim(base, '/'),
                    this.trim(path, '/')
                  ].join('/')
                }

                // If all else fails.
                return path
              }

              getPropsFromDef(def) {
                const imageDefSplit = def.split(/#xywh=/i)
                const imageUrl = imageDefSplit[0]
                const imageCoords = imageDefSplit[1]
                const splitCoords = imageCoords.match(/[0-9]+/gi)
                return {
                  x: splitCoords[0],
                  y: splitCoords[1],
                  w: splitCoords[2],
                  h: splitCoords[3],
                  image: imageUrl
                }
              }

              getVttCss(vttImageDef) {

                const cssObj = {}

                // If there isn't a protocol, use the VTT source URL.
                let baseSplit
                if (this.options.baseUrl) {
                  baseSplit = this.options.baseUrl
                } else if (this.options.src.indexOf('//') >= 0) {
                  baseSplit = this.options.src.split(/([^\\/]*)$/gi).shift()
                } else {
                  baseSplit = this.getBaseUrl() + this.options.src.split(/([^\\/]*)$/gi).shift()
                }

                vttImageDef = this.getFullyQualifiedUrl(vttImageDef, baseSplit)

                // deal with regular thumbnails
                if (!vttImageDef.match(/#xywh=/i)) {
                  cssObj.background = 'url("' + vttImageDef + '")'
                  cssObj.url = vttImageDef
                  return cssObj
                }

                // deal with sprited thumbnails
                const imageProps = this.getPropsFromDef(vttImageDef)
                cssObj.background = 'url("' + imageProps.image + '") no-repeat -' + imageProps.x + 'px -' + imageProps.y + 'px'
                cssObj.width = imageProps.w + 'px'
                cssObj.height = imageProps.h + 'px'
                cssObj.url = imageProps.image

                return cssObj
              }

              doconstructTimestamp(timestamp) {
                const splitStampMilliseconds = timestamp.split('.')
                const timeParts = splitStampMilliseconds[0]
                const timePartsSplit = timeParts.split(':')
                return {
                  milliseconds: parseInt(splitStampMilliseconds[1]) || 0,
                  seconds: parseInt(timePartsSplit.pop()) || 0,
                  minutes: parseInt(timePartsSplit.pop()) || 0,
                  hours: parseInt(timePartsSplit.pop()) || 0,
                }

              }

              getSecondsFromTimestamp(timestamp) {
                const timestampParts = this.doconstructTimestamp(timestamp)
                return parseInt((timestampParts.hours * (60 * 60)) +
                    (timestampParts.minutes * 60) +
                    timestampParts.seconds +
                    (timestampParts.milliseconds / 1000))
              }

              trim(str, charlist) {
                let whitespace = [
                  ' ',
                  '\\n',
                  '\\r',
                  '\\t',
                  '\\f',
                  '\x0b',
                  '\xa0',
                  '\u2000',
                  '\u2001',
                  '\u2002',
                  '\u2003',
                  '\u2004',
                  '\u2005',
                  '\u2006',
                  '\u2007',
                  '\u2008',
                  '\u2009',
                  '\u200a',
                  '\u200b',
                  '\u2028',
                  '\u2029',
                  '\u3000'
                ].join('')
                let l = 0
                let i = 0
                str += ''
                if (charlist) {
                  whitespace = (charlist + '').replace(/([[\\]().?/*{}+$^:])/g, '$1')
                }
                l = str.length
                for (i = 0; i < l; i++) {
                  if (whitespace.indexOf(str.charAt(i)) === -1) {
                    str = str.substring(i)
                    break
                  }
                }
                l = str.length
                for (i = l - 1; i >= 0; i--) {
                  if (whitespace.indexOf(str.charAt(i)) === -1) {
                    str = str.substring(0, i + 1)
                    break
                  }
                }
                return whitespace.indexOf(str.charAt(0)) === -1 ? str : ''
              }

            }

            // Register the plugin with video.js.
            registerPlugin('vttThumbnails', vttThumbnails)

            // Include the version number.
            vttThumbnails.VERSION = VERSION
          </script>

          <script>
            'use strict';

            let player;
            document.addEventListener('DOMContentLoaded', () => {
              player = videojs(document.querySelector('.video-js'), {
                sources: [{
                  src: '${new URL(`/alias/${aliasToken}/manifest.mpd#t=0`, getConfig().data.baseUrl).href}',
                  type: 'application/dash+xml'
                }],

                techOrder: ['html5'],
                html5: {
                  vhs: {
                    overrideNative: true
                  }
                },

                playbackRates: [0.5, 1, 1.5, 2],

                liveui: true,
                liveTracker: {
                  trackingThreshold: 0
                },

                plugins: {
                  dashHlsBitrateSwitcher: {
                    support: 'both',
                  },

                  settingsMenu: {
                    items: [
                      'AudioTrackButton',
                      'ChaptersButton',
                      'SubsCapsButton',
                      'PlaybackRateMenuButton',
                      'RatesButton'
                    ]
                  },

                  vttThumbnails: {
                    src: '${videoFrontendUrl}?type=webttv_thumbnails',
                    showTimestamp: true
                  },
                  persist: {
                    playbackRate: false
                  }
                }
              }, () => {
                player.currentTime(0);
              });
            });
          </script>
        </body>
        </html>`;
      liveTranscodeCache[inputFileAbsolutePath] = html;
      res.send(html);
    }
  });
  ffmpegProcess.on('exit', (code) => {
    console.log(`ffmpeg process exited with code ${code}`);

    if (!res.headersSent) {
      res.status(500)
          .send('ffmpeg process exited with code ' + code);
    }

    if (code != 0) {
      liveTranscodeCache[inputFileAbsolutePath] = 'An error occurred';
    }
  });
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
