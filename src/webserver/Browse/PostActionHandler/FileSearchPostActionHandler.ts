import express from 'express';
import Path from 'path';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';
import FileSearch from '../../../FileSearch';
import Utils from '../../../Utils';
import IPostActionHandler from './IPostActionHandler';

export default class FileSearchPostActionHandler implements IPostActionHandler {
  getActionKey(): string {
    return 'apollo-search';
  }

  async handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, frontendType: 'browse' | 'trash', postValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
          .type('text/plain')
          .send('Invalid value provided');
      return;
    }

    const searchResults = await new FileSearch().searchFile(file.getFileSystem().getFile(decodeURI(req.path)), postValue);

    let responseStr = `<h1>Suchergebnisse für '${postValue}'</h1><ul>`;
    for (const innerFile of searchResults) {
      const innerFileMimeType = await innerFile.getMimeType();
      const innerFileStat = await innerFile.stat();

      responseStr += `<li><a class="hoverable" href="${Path.join('/browse', encodeURIComponent(innerFile.getPath()))}">${innerFile.getName()}</a> (${innerFileStat.isFile() ? innerFileMimeType : 'Directory'}; ${Utils.prettifyFileSize(innerFileStat.size)})<div class="hover-box"><img width="500px" height="500px" src="${Path.join(req.originalUrl, encodeURIComponent(innerFile.getName()))}?type=thumbnail"></div></li>`;
    }
    responseStr += '</ul>';

    res.status(200)
        .type('text/html')
        .send(responseStr);
  }
}
