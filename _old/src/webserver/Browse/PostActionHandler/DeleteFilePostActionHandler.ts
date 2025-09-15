import express from 'express';
import ApolloUser from '../../../user/ApolloUser';
import VirtualFile from '../../../user/files/VirtualFile';
import IPostActionHandler from './IPostActionHandler';

export default class DeleteFilePostActionHandler implements IPostActionHandler {
  getActionKey(): string {
    return 'apollo-delete-file';
  }

  async handle(req: express.Request, res: express.Response, user: ApolloUser, file: VirtualFile | null, frontendType: 'browse' | 'trash', postValue: string): Promise<void> {
    if (file == null) {
      res.status(400)
        .type('text/plain')
        .send('Invalid value provided');
      return;
    }

    if (frontendType != 'trash') {
      // TODO: Use a 'move file action' instead and allow it to provide a file system
      await this.moveToTrashBin(req, res, file);
      return;
    }

    await file.fileSystem.acquireLock(req, file, async (writeableFile) => {
      if (await file.exists()) {
        await writeableFile.deleteIgnoringTrashBin({ recursive: true });  // TODO: Client should send recursive true/false to make sure a directory is deleted only when a directory is expected

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

  private async moveToTrashBin(req: express.Request, res: express.Response, file: VirtualFile): Promise<void> {
    await file.fileSystem.acquireLock(req, file, async (writeableFile) => {
      if (await file.exists()) {
        await writeableFile.moveToTrashBin();

        res.status(200)
          .type('text/plain')
          .send('File moved to trash bin');
        return;
      }

      res.status(404)
        .type('text/plain')
        .send('File not found');
    });
  }
}
