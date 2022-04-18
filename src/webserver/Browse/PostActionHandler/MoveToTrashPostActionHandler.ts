import express from 'express';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';
import IPostActionHandler from './IPostActionHandler';

export default class MoveToTrashPostActionHandler implements IPostActionHandler {
  getActionKey(): string {
    return 'apollo-move-to-trash';
  }

  async handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, postValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
          .type('text/plain')
          .send('Invalid value provided');
      return;
    }

    await file.getFileSystem().acquireLock(req, file, async (writeableFile) => {
      if (await file.exists()) {
        await writeableFile.moveToTrashBin();

        res.status(200)
            .type('text/plain')
            .send('File deleted');
        return;
      }

      res.status(404)
          .type('text/plain')
          .send('File not found');
    });
  }
}
