import express from 'express';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';
import IPostActionHandler from './IPostActionHandler';

export default class CreateFilePostActionHandler implements IPostActionHandler {
  readonly createDirectory: boolean;

  constructor(createDirectory: boolean) {
    this.createDirectory = createDirectory;
  }

  getActionKey(): string {
    return this.createDirectory ? 'apollo-create-directory' : 'apollo-create-file';
  }

  async handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, postValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
          .type('text/plain')
          .send('Invalid value provided');
      return;
    }

    await file.getFileSystem().acquireLock(req, file, async (writeableFile) => {
      if (!(await file.exists())) {
        if (this.createDirectory) {
          await writeableFile.mkdir();
        } else {
          await writeableFile.write('');
        }

        res.status(201)
            .type('text/plain')
            .send((this.createDirectory ? 'Directory' : 'File') + ' created');
        return;
      }

      res.status(409)
          .type('text/plain')
          .send('File already exists');
    });
  }
}
