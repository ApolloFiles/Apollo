import * as Archiver from 'archiver';
import express from 'express';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { getConfig, getFileNameCollator } from '../../Constants';
import FileIndex from '../../files/index/FileIndex';
import { BreadcrumbItem, FileIcon, FilesTemplate, FilesTemplateData } from '../../frontend/FilesTemplate';
import UrlBuilder from '../../frontend/UrlBuilder';
import WebVttKeyframeGenerator from '../../media/watch/WebVttKeyframeGenerator';
import ThumbnailGenerator from '../../ThumbnailGenerator';
import ApolloUser from '../../user/ApolloUser';
import LocalFile from '../../user/files/local/LocalFile';
import VirtualFile from '../../user/files/VirtualFile';
import Utils from '../../Utils';
import { registerAliasHandler } from '../AliasRouter';
import WebServer from '../WebServer';

type FileRequestType = 'thumbnail' | 'download' | 'search' | 'live_transcode' | 'webvtt_thumbnails';
const allowedFileRequestTypes = ['thumbnail', 'download', 'search', 'live_transcode', 'webvtt_thumbnails'];  // Needs to be identical to FileRequestType

export function filesHandleGet(req: express.Request, res: express.Response, next: express.NextFunction, frontendType: 'browse' | 'trash'): () => Promise<void> {
  return async (): Promise<void> => {
    res.locals.timings?.startNext('#filesHandleGet');

    if (req.query.type != null && (typeof req.query.type != 'string' || !allowedFileRequestTypes.includes(req.query.type))) {
      res.status(400)
        .send('Invalid type requested');
      return;
    }

    const fileRequestType = req.query.type as FileRequestType | undefined;

    const user = WebServer.getUser(req);
    const fileSystem = frontendType == 'browse' ? user.getDefaultFileSystem() : user.getTrashBinFileSystem();

    const requestedFilePath = Utils.decodeUriProperly(req.path);
    const file = await fileSystem.getFile(requestedFilePath);

    if (!(await file.exists())) {
      if (file.path != '/') {
        console.debug(`User '${user.displayName}' requested non-existent file '${requestedFilePath}'`);
        res.status(404)
          .send('File not found');
        return;
      }

      res.locals.timings?.startNext('createUserRootDirectory');
      await fileSystem.acquireLock(req, file, (writeableFile) => writeableFile.mkdir({ recursive: true }));
    }

    if (await file.isDirectory()) {
      res.locals.timings?.startNext('handleDirectoryRequest');
      await handleDirectoryRequest(req, res, user, file, frontendType, fileRequestType);
      return;
    }

    if (await file.isFile()) {
      res.locals.timings?.startNext('handleFileRequest');
      await handleFileRequest(req, res, next, user, file, fileRequestType);
      return;
    }

    console.debug(`User '${user.displayName}' requested unknown file '${requestedFilePath}'`);
    res.status(500)
      .type('text/plain')
      .send('Unknown file type\n\n' + JSON.stringify(file, null, 2));
  };
}

async function handleDirectoryRequest(req: express.Request, res: express.Response, user: ApolloUser, file: VirtualFile, type: 'browse' | 'trash', fileRequestType?: FileRequestType): Promise<void> {
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

    res.locals.timings?.startNext('searchFiles:init');
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      res.status(500)
        .send('Search is not available without an file index');
      return;
    }
    res.locals.timings?.startNext('searchFiles:start');
    const searchResult = await fileIndex.search(file, req.query.search);
    res.locals.timings?.startNext('searchFiles:render');
    await sendDirectoryView(req, res, type, null, searchResult);
    return;
  }

  if (fileRequestType === 'download') {
    res.locals.timings?.startNext('downloadDirectory:init');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${Utils.tryReplacingBadCharactersForFileName(file.getFileName())}.zip"`);

    const zip = Archiver.create('zip', { store: true, forceZip64: true });
    zip.pipe(res);

    res.on('close', () => {
      zip.abort();
      zip.end();
    });
    zip.on('close', () => {
      res.end();
    });

    if (!(file instanceof LocalFile)) {
      res.status(500)
        .send('Cannot download the given directory as it does not exist on the host');
      return;
    }

    res.locals.timings?.startNext('downloadDirectory:zip');
    zip.directory(file.getAbsolutePathOnHost(), file.getFileName());
    await zip.finalize();

    return;
  }

  console.debug(`User '${user.displayName}' requested directory '${file.path}'`);

  res.locals.timings?.startNext('getFileList');
  const files = await file.getFiles();
  res.locals.timings?.startNext('sendDirectoryView');
  await sendDirectoryView(req, res, type, file, files);
}

async function sendDirectoryView(req: express.Request, res: express.Response, type: 'browse' | 'trash', requestedFile: VirtualFile | null, files: VirtualFile[]): Promise<void> {
  res.locals.timings?.startNext('#sendDirectoryView_findDirectories');

  const directoryFiles: VirtualFile[] = [];
  for (const innerFile of files) {
    try {
      if (await innerFile.isDirectory()) {
        directoryFiles.push(innerFile);
      }
    } catch (err: any) {
      if (err?.code != 'ENOENT') {
        throw err;
      }
    }
  }

  res.locals.timings?.startNext('#sendDirectoryView_sortFileList');
  files.sort((a, b) => {
    if (directoryFiles.includes(a) && !directoryFiles.includes(b)) {
      return -1;
    }
    if (!directoryFiles.includes(a) && directoryFiles.includes(b)) {
      return 1;
    }

    return getFileNameCollator().compare(a.getFileName(), b.getFileName());
  });

  res.locals.timings?.startNext('#sendDirectoryView_prepareFileListForRender');
  const filesToRender: FilesTemplateData['files'] = [];
  for (const innerFile of files) {
    try {
      const innerFileStat = await innerFile.stat();
      const innerFileMimeType = await innerFile.getMimeType();

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
        name: innerFile.getFileName(),
        owner: 'Ich',
        lastChanged: innerFileStat.mtime,
        size: /*Utils.prettifyFileSize(await innerFile.getSize())*/ '-',
        mimeType: innerFileMimeType,

        frontendUrl: await UrlBuilder.buildUrl(innerFile, innerFileStat)
      });
      // responseStr += `<li><a class="${innerFileStat.isFile() ? 'hoverable' : ''}" href="${}">${innerFile.getName()}</a> (${innerFileStat.isFile() ? innerFileMimeType : 'Directory'}; ${Utils.prettifyFileSize(innerFileStat.isFile() ? innerFileStat.size : await fastDirectorySize.getDirectorySize(innerFile.getAbsolutePathOnHost() as string))})<div class="hover-box"><img width="256px" height="256px" ${innerFileStat.isFile() ? '' : 'disabled-'}src="${Path.join(req.originalUrl, encodeURIComponent(innerFile.getName()))}?type=thumbnail"></div></li>`;
    } catch (err: any) {
      if (err?.code != 'ENOENT') {
        throw err;
      }
    }
  }

  res.locals.timings?.startNext('#sendDirectoryView_calculateTotalStorageUsage');
  const totalStorageUsage = /*requestedFile ? Utils.prettifyFileSize(await requestedFile.getFileSystem().getSize()) :*/ -1;

  res.locals.timings?.startNext('#sendDirectoryView_render');
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
          { type: 'info', msg: `Aktueller Gesamtverbrauch: ${totalStorageUsage}`, dismissible: false }
        ] : [],
        files: filesToRender,
        breadcrumbs: requestedFile ? await generateBreadcrumbs(requestedFile) : []
      }
    ));

  // let responseStr = `${file.getPath() == '/' ? '' : `<a href="${Utils.encodeUriProperly(Path.dirname(Utils.decodeUriProperly(req.originalUrl)))}">Go up to ${Path.dirname(file.getPath())}</a>`}` +
  //     `` +
  //     `<form method="post"><input name="action" type="hidden" value="${new CreateFilePostActionHandler(false).getActionKey()}"><input name="value" placeholder="Dateiname" type="text" required><button type="submit">Create file</button></form>` +
  //     `<form method="post"><input name="action" type="hidden" value="${new CreateFilePostActionHandler(true).getActionKey()}"><input name="value" placeholder="Ordnername" type="text" required><button type="submit">Create directory</button></form>` +
  //     `<form method="post" enctype="multipart/form-data"><input name="action" type="hidden" value="${new FileUploadPostActionHandler().getActionKey()}"><input name="value" type="file" required multiple><button type="submit">Upload file</button></form>` +
  //     '<ul>';
}

async function handleFileRequest(req: express.Request, res: express.Response, next: express.NextFunction, user: ApolloUser, file: VirtualFile, fileRequestType?: FileRequestType): Promise<void> {
  if (fileRequestType == 'search') {
    res.status(400)
      .type('text/plain')
      .send('Search not available when requesting a file');
    return;
  }

  if (fileRequestType == 'thumbnail') {
    if(!(file instanceof LocalFile)){
      res
        .status(501)
        .send('Cannot generate thumbnail for file that does not exist on the host');
      return;
    }

    const start = process.hrtime();
    const thumbnail = await new ThumbnailGenerator().generateThumbnail(file);
    const tookMs = (process.hrtime(start)[1] / 1000000).toFixed(2);

    if (thumbnail != null) {
      console.log(`User '${user.displayName}' successfully requested thumbnail for file '${file.path}' in ${tookMs}ms`);
      res.type(thumbnail.mime)
        .send(thumbnail.data);
      return;
    }

    console.log(`User '${user.displayName}' failed to generate thumbnail for file '${file.path}' in ${tookMs}ms`);
    res.status(501)
      .send(`Cannot generate thumbnail for given file type (${await file.getMimeType()})`);
    return;
  }

  if (fileRequestType == 'live_transcode') {
    res.status(410 /* GONE */)
      .send('Live transcoding has moved to a separate endpoint');
    return;
  }

  if (fileRequestType == 'webvtt_thumbnails') {
    return handleWebVttThumbnailRequest(req, res, next, user, file);
  }

  console.log(`User '${user.displayName}' requested file '${file.path}'`);
  await Utils.sendFileRespectingRequestedRange(req, res, next, file, await file.getMimeType() ?? 'text/plain', fileRequestType == 'download');
}

const webVttThumbnailCache: { [key: string]: string } = {};

async function handleWebVttThumbnailRequest(req: express.Request, res: express.Response, next: express.NextFunction, user: ApolloUser, file: VirtualFile): Promise<void> {
  if (!(file instanceof LocalFile)) {
    throw new Error('File does not exist on host file system');
  }

  const inputFileAbsolutePath = file.getAbsolutePathOnHost();
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

  const webVtt = await new WebVttKeyframeGenerator().generate(inputFileAbsolutePath, cwd);

  const aliasToken = Crypto.createHash('sha256')
    .update('webvtt_thumbnails')
    .update(inputFileAbsolutePath)
    .digest()
    .toString('hex');
  registerAliasHandler(aliasToken, (req, res) => {
    if (req.path.match(/\/chunk_\d+.png/) != null) {
      res.sendFile(Path.join(cwd, req.path));
    } else {
      res.status(404)
        .send('Not found');
    }
  });

  webVttThumbnailCache[inputFileAbsolutePath] = (await Fs.promises.readFile(Path.join(cwd, WebVttKeyframeGenerator.VTT_FILE_NAME), 'utf-8')).replaceAll('keyframes_', new URL(`/alias/${aliasToken}/keyframes_`, getConfig().data.baseUrl).href);

  res
    .type('text/vtt')
    .send(webVttThumbnailCache[inputFileAbsolutePath]);
}

async function generateBreadcrumbs(file: VirtualFile): Promise<BreadcrumbItem[]> {
  const path = file.path;
  const pathArgs = file.path.split('/');

  if (path.charAt(0) == '/') {
    pathArgs.shift();
  }

  if (path.charAt(path.length - 1) == '/') {
    pathArgs.pop();
  }

  const result: BreadcrumbItem[] = [{
    name: 'root',
    frontendUrl: await UrlBuilder.buildUrl(file.fileSystem.getFile('/'))
  }];

  let currPath = '/';
  for (const arg of pathArgs) {
    currPath += arg + '/';

    result.push({
      name: arg,
      frontendUrl: await UrlBuilder.buildUrl(file.fileSystem.getFile(currPath))
    });
  }

  return result;
}
