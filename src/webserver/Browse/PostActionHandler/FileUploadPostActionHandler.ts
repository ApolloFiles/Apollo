import express from 'express';
import Fs from 'fs';
import Path from 'path';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';
import IPostActionHandler from './IPostActionHandler';

export default class FileUploadPostActionHandler implements IPostActionHandler {
  getActionKey(): string {
    return 'apollo-file-upload';
  }

  async handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, frontendType: 'browse' | 'trash', postValue: string): Promise<void> {
    if (frontendType != 'browse') {
      res.status(400)
          .type('text/plain')
          .send('File upload is only allowed in browse mode.');
      return;
    }

    if (req.files == null || req.files['value'] == null) {
      res.status(400)
          .type('text/plain')
          .send('No file uploaded');
      return;
    }

    if (!Array.isArray(req.files['value'])) {
      req.files['value'] = [req.files['value']];
    }

    const uploadedFiles = req.files['value'];

    let errored: string[] = [];

    for (const uploadedFile of uploadedFiles) {
      const targetFile = user.getDefaultFileSystem().getFile(Path.join(decodeURI(req.path), uploadedFile.name));

      await user.getDefaultFileSystem().acquireLock(req, targetFile, async () => {
        if (await targetFile.exists()) {
          await Fs.promises.rm(uploadedFile.tempFilePath);

          errored.push(`A file with the name '${uploadedFile.name}' already exists`);
          return;
        }

        const targetFilePath = targetFile.getAbsolutePathOnHost();
        if (targetFilePath == null) {
          await Fs.promises.rm(uploadedFile.tempFilePath);

          res.status(500)
              .type('text/plain')
              .send('The destination cannot be resolved on the host, this is currently not supported');
          return;
        }

        await Fs.promises.rename(uploadedFile.tempFilePath, targetFilePath);
      });

      if (res.headersSent) {
        return;
      }
    }

    if (errored.length > 0) {
      res.status(400)
          .type('text/plain')
          .send('Upload of some/all files failed:\n' + errored.join('\n'));
      return;
    }

    res.status(201)
        .type('text/plain')
        .send('Files have been uploaded:\n' + uploadedFiles.map(f => f.name).join('\n'));
  }
}
