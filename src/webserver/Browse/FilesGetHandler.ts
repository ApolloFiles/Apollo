import express from 'express';
import * as fastDirectorySize from 'fast-directory-size';
import Path from 'path';
import AbstractUser from '../../AbstractUser';
import { getFileNameCollator } from '../../Constants';
import IUserFile from '../../files/IUserFile';
import { FileIcon, FilesTemplate, FilesTemplateData } from '../../frontend/FilesTemplate';
import ThumbnailGenerator from '../../ThumbnailGenerator';
import Utils from '../../Utils';
import WebServer from '../WebServer';

export function filesHandleGet(req: express.Request, res: express.Response, type: 'browse' | 'trash'): () => Promise<void> {
  return async () => {
    const user = WebServer.getUser(req);
    const fileSystem = type == 'browse' ? user.getDefaultFileSystem() : user.getTrashBinFileSystem();

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

    const wantsThumbnail = req.query.type === 'thumbnail';

    if (await file.isDirectory()) {
      if (wantsThumbnail) {
        res.status(400)
            .send('Cannot generate thumbnail for directory');
        return;
      }

      await handleDirectoryRequest(req, res, user, file, type);
      return;
    }

    if (await file.isFile()) {
      await handleFileRequest(req, res, user, file, wantsThumbnail);
      return;
    }

    console.debug(`User '${user.getDisplayName()}' requested unknown file '${requestedFilePath}'`);
    res.status(500)
        .type('text/plain')
        .send('Unknown file type\n\n' + JSON.stringify(file, null, 2));
  };
}

async function handleDirectoryRequest(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile, type: 'browse' | 'trash'): Promise<void> {
  if (!req.path.endsWith('/')) {
    res.redirect(req.originalUrl + '/');
    return;
  }

  console.debug(`User '${user.getDisplayName()}' requested directory '${file.getPath()}'`);

  const files = await file.getFiles();
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

      frontendUrl: Path.join(req.originalUrl, encodeURIComponent(innerFile.getName()))
    });
    // responseStr += `<li><a class="${innerFileStat.isFile() ? 'hoverable' : ''}" href="${}">${innerFile.getName()}</a> (${innerFileStat.isFile() ? innerFileMimeType : 'Directory'}; ${Utils.prettifyFileSize(innerFileStat.isFile() ? innerFileStat.size : await fastDirectorySize.getDirectorySize(innerFile.getAbsolutePathOnHost() as string))})<div class="hover-box"><img width="256px" height="256px" ${innerFileStat.isFile() ? '' : 'disabled-'}src="${Path.join(req.originalUrl, encodeURIComponent(innerFile.getName()))}?type=thumbnail"></div></li>`;
  }

  const totalStorageUsage = Utils.prettifyFileSize(await file.getFileSystem().getSize());

  res.type('text/html')
      .send(new FilesTemplate(type).render(
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
            banners: [
              {type: 'info', msg: `Aktueller Gesamtverbrauch: ${totalStorageUsage}`, dismissible: false}
            ],
            files: filesToRender
          }
      ));

  // let responseStr = `${file.getPath() == '/' ? '' : `<a href="${encodeURI(Path.dirname(decodeURI(req.originalUrl)))}">Go up to ${Path.dirname(file.getPath())}</a>`}` +
  //     `` +
  //     `<form method="post"><input name="action" type="hidden" value="${new CreateFilePostActionHandler(false).getActionKey()}"><input name="value" placeholder="Dateiname" type="text" required><button type="submit">Create file</button></form>` +
  //     `<form method="post"><input name="action" type="hidden" value="${new CreateFilePostActionHandler(true).getActionKey()}"><input name="value" placeholder="Ordnername" type="text" required><button type="submit">Create directory</button></form>` +
  //     `<form method="post"><input name="action" type="hidden" value="${new MoveToTrashPostActionHandler().getActionKey()}"><input name="value" placeholder="Dateiname" type="text" required><button type="submit">Move to trash</button></form>` +
  //     `<form method="post" enctype="multipart/form-data"><input name="action" type="hidden" value="${new FileUploadPostActionHandler().getActionKey()}"><input name="value" type="file" required multiple><button type="submit">Upload file</button></form>` +
  //     '<ul>';
}

async function handleFileRequest(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile, wantsThumbnail: boolean): Promise<void> {
  if (wantsThumbnail) {
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

  res.setHeader('Content-Length', fileSize);
  if (bytesStart != undefined && bytesEnd != undefined) {
    res.status(206);
    res.setHeader('Content-Length', bytesEnd - bytesStart + 1);
    res.setHeader('Content-Range', `bytes ${bytesStart}-${bytesEnd}/${fileSize}`);
  }

  fileReadStream.pipe(res);
}
