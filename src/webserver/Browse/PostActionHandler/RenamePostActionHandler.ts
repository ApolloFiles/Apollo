import express from 'express';
import Path from 'node:path';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';
import IPostActionHandler from './IPostActionHandler';

export default class RenamePostActionHandler implements IPostActionHandler {
  getActionKey(): string {
    return 'apollo-rename';
  }

  async handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, frontendType: 'browse' | 'trash', postValue: string, newPostValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
        .type('text/plain')
        .send('Invalid value provided');
      return;
    }

    const destFile = file.getFileSystem().getFile(Path.join(Path.dirname(file.getPath()), newPostValue));

    if (file.getPath() == destFile.getPath()) {
      res.status(400)
        .type('text/plain')
        .send('Invalid value provided');
      return;
    }

    await file.getFileSystem().acquireLock(req, file, async (writeableSrcFile) => {
      await file.getFileSystem().acquireLock(req, destFile, async (writeableDestFile) => {
        if (await destFile.exists()) {
          res.status(409)
            .type('text/plain')
            .send('File with that name already exists');
          return;
        }

        await writeableSrcFile.move(writeableDestFile);

        res.status(200)
          .type('text/plain')
          .send('OK');
      });
    });
  }
}
