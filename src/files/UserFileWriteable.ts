import express from 'express';
import Fs from 'fs';
import NodeEvents from 'node:events';
import NodeStream from 'node:stream';
import Path from 'path';
import IUserFile from './IUserFile';
import IUserFileWriteable from './IUserFileWriteable';

export default class UserFileWriteable implements IUserFileWriteable {
  protected readonly req: express.Request;
  protected readonly userFile: IUserFile;

  constructor(req: express.Request, userFile: IUserFile) {
    this.req = req;
    this.userFile = userFile;
  }

  async write(
      data: string | NodeJS.ArrayBufferView | Iterable<string | NodeJS.ArrayBufferView> | AsyncIterable<string | NodeJS.ArrayBufferView> | NodeStream,
      options?: (Fs.ObjectEncodingOptions & { mode?: Fs.Mode | undefined; flag?: Fs.OpenMode | undefined; } & NodeEvents.Abortable) | BufferEncoding | null
  ): Promise<void> {
    const filePath = this.userFile.getAbsolutePathOnHost();

    if (filePath == null) {
      throw new Error('File path is null');
    }

    await Fs.promises.mkdir(Path.dirname(filePath), {recursive: true});
    await Fs.promises.writeFile(filePath, data, options);
  }

  async mkdir(options?: Fs.MakeDirectoryOptions): Promise<void> {
    const filePath = this.userFile.getAbsolutePathOnHost();

    if (filePath == null) {
      throw new Error('File path is null');
    }

    await Fs.promises.mkdir(filePath, options);
  }

  async move(destination: IUserFileWriteable): Promise<void> {
    const srcPath = this.userFile.getAbsolutePathOnHost();
    const destPath = destination.getUserFile().getAbsolutePathOnHost();

    if (srcPath == null || destPath == null) {
      throw new Error(`Path cannot be null (src="${srcPath}",dest="${destPath}")`);
    }

    return Fs.promises.rename(srcPath, destPath);
  }

  async moveToTrashBin(): Promise<void> {
    if (this.userFile.getFileSystem().getAbsolutePathOnHost() == this.userFile.getOwner().getTrashBinFileSystem().getAbsolutePathOnHost()) {
      throw new Error('File is already in trash bin');
    }

    const srcFileSystemRootPathOnHost = this.userFile.getFileSystem().getAbsolutePathOnHost();
    const srcAbsolutePathOnHost = this.userFile.getAbsolutePathOnHost();
    if (srcAbsolutePathOnHost == null) {
      throw new Error('File path is null');
    }

    const relativeFileInTrashBin = Path.relative(srcFileSystemRootPathOnHost, srcAbsolutePathOnHost);
    // console.log(`From '${srcFileSystemRootPathOnHost}' to '${srcAbsolutePathOnHost}': ${relativeFileInTrashBin}`);
    const targetFileSystem = this.userFile.getOwner().getTrashBinFileSystem();
    const targetFile = targetFileSystem.getFile(relativeFileInTrashBin);
    const targetFileAbsolutePathOnHost = targetFile.getAbsolutePathOnHost();

    if (targetFileAbsolutePathOnHost == null) {
      throw new Error('File path is null');
    }

    await targetFileSystem.acquireLock(this.req, targetFile, async (writeableFile) => {
      await targetFileSystem.acquireLock(this.req,
          targetFileSystem.getFile(Path.dirname(targetFile.getPath())),
          (writeableParentFile) => writeableParentFile.mkdir({recursive: true})
      );

      if (!(await targetFile.exists())) {
        await Fs.promises.rename(srcAbsolutePathOnHost, targetFileAbsolutePathOnHost);
        return;
      }

      let newTargetFile: IUserFile;
      let counter = 0;
      let loop = true;
      while (loop) {
        ++counter;

        newTargetFile = targetFileSystem.getFile(Path.join(Path.dirname(targetFile.getPath()), Path.basename(targetFile.getPath(), Path.extname(targetFile.getPath())) + '~' + counter + Path.extname(targetFile.getPath())));
        const newTargetFileAbsolutePathOnHost = newTargetFile.getAbsolutePathOnHost();

        if (newTargetFileAbsolutePathOnHost == null) {
          throw new Error('File path is null');
        }

        await targetFileSystem.acquireLock(this.req, newTargetFile, async (writeableFile) => {
          if (!await newTargetFile.exists()) {
            loop = false;

            await Fs.promises.rename(srcAbsolutePathOnHost, newTargetFileAbsolutePathOnHost);
          }
        });
      }
    });

    // await Fs.promises.rename(filePath, Path.join(Path.dirname(filePath), 'trash', Path.basename(filePath)));
  }

  async deleteIgnoringTrashBin(options?: Fs.RmOptions): Promise<void> {
    const filePath = this.userFile.getAbsolutePathOnHost();

    if (filePath == null) {
      throw new Error('File path is null');
    }

    if (options?.recursive != true && await this.userFile.isDirectory()) {
      await Fs.promises.rmdir(filePath, options);
      return;
    }

    await Fs.promises.rm(filePath, options);
  }

  getUserFile(): IUserFile {
    return this.userFile;
  }
}
