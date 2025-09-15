import express from 'express';
import ApolloUser from '../../../user/ApolloUser';
import VirtualFile from '../../../user/files/VirtualFile';
import IPostActionHandler from './IPostActionHandler';

export default class CreateFilePostActionHandler implements IPostActionHandler {
  readonly createDirectory: boolean;

  constructor(createDirectory: boolean) {
    this.createDirectory = createDirectory;
  }

  getActionKey(): string {
    return this.createDirectory ? 'apollo-create-directory' : 'apollo-create-file';
  }

  async handle(req: express.Request, res: express.Response, user: ApolloUser, file: VirtualFile | null, frontendType: 'browse' | 'trash', postValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
        .type('text/plain')
        .send('Invalid value provided');
      return;
    }

    await file.fileSystem.acquireLock(req, file, async (writeableFile) => {
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
