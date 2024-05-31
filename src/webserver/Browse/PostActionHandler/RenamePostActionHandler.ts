import express from 'express';
import Path from 'node:path';
import ApolloUser from '../../../user/ApolloUser';
import VirtualFile from '../../../user/files/VirtualFile';
import IPostActionHandler from './IPostActionHandler';

export default class RenamePostActionHandler implements IPostActionHandler {
  getActionKey(): string {
    return 'apollo-rename';
  }

  async handle(req: express.Request, res: express.Response, user: ApolloUser, file: VirtualFile | null, frontendType: 'browse' | 'trash', postValue: string, newPostValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
        .type('text/plain')
        .send('Invalid value provided');
      return;
    }

    const destFile = file.fileSystem.getFile(Path.join(Path.dirname(file.path), newPostValue));

    if (file.path == destFile.path) {
      res.status(400)
        .type('text/plain')
        .send('Invalid value provided');
      return;
    }

    await file.fileSystem.acquireLock(req, file, async (writeableSrcFile) => {
      await file.fileSystem.acquireLock(req, destFile, async (writeableDestFile) => {
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
