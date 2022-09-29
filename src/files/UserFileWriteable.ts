import express from 'express';
import Fs from 'fs';
import NodeEvents from 'node:events';
import NodeStream from 'node:stream';
import Path from 'path';
import { getFileStatCache } from '../Constants';
import BackgroundProcess from '../process_manager/BackgroundProcess';
import FileIndex from './index/FileIndex';
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

    const firstDirCreated = await Fs.promises.mkdir(Path.dirname(filePath), {recursive: true});
    await Fs.promises.writeFile(filePath, data, options);

    await getFileStatCache().clearFile(this.userFile);
    UserFileWriteable.updateFileIndexMkDir(this.userFile, firstDirCreated != null);
    UserFileWriteable.updateFileIndexWrite(this.userFile);
  }

  async mkdir(options?: Fs.MakeDirectoryOptions): Promise<void> {
    const filePath = this.userFile.getAbsolutePathOnHost();

    if (filePath == null) {
      throw new Error('File path is null');
    }

    const firstDirCreated = await Fs.promises.mkdir(filePath, options);

    await getFileStatCache().clearFile(this.userFile);
    UserFileWriteable.updateFileIndexMkDir(this.userFile, firstDirCreated != null);
  }

  async move(destination: IUserFileWriteable): Promise<void> {
    const srcPath = this.userFile.getAbsolutePathOnHost();
    const destPath = destination.getUserFile().getAbsolutePathOnHost();

    if (srcPath == null || destPath == null) {
      throw new Error(`Path cannot be null (src="${srcPath}",dest="${destPath}")`);
    }

    await Fs.promises.rename(srcPath, destPath);

    await getFileStatCache().clearFile(this.userFile);
    await getFileStatCache().clearFile(destination.getUserFile());
    UserFileWriteable.updateFileIndexRename(this.userFile, destination);
  }

  async moveToTrashBin(): Promise<void> {
    if (this.userFile.getFileSystem().getAbsolutePathOnHost() == this.userFile.getOwner().getTrashBinFileSystem().getAbsolutePathOnHost()) {
      throw new Error('File is already in trash bin');
    }

    const srcAbsolutePathOnHost = this.userFile.getAbsolutePathOnHost();
    if (srcAbsolutePathOnHost == null) {
      throw new Error('File path is null');
    }

    const targetFileSystem = this.userFile.getOwner().getTrashBinFileSystem();
    const targetFile = targetFileSystem.getFile(this.userFile.getPath());

    const targetFileAbsolutePathOnHost = targetFile.getAbsolutePathOnHost();
    if (targetFileAbsolutePathOnHost == null) {
      throw new Error('File path is null');
    }

    await targetFileSystem.acquireLock(this.req, targetFile, async (writeableFile) => {
      await targetFileSystem.acquireLock(
          this.req,
          targetFileSystem.getFile(Path.dirname(targetFile.getPath())),
          (writeableParentFile) => writeableParentFile.mkdir({recursive: true})
      );

      if (!(await targetFile.exists())) {
        return this.move(writeableFile);
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

            return this.move(writeableFile);
          }
        });
      }
    });
  }

  async deleteIgnoringTrashBin(options?: Fs.RmOptions): Promise<void> {
    const filePath = this.userFile.getAbsolutePathOnHost();

    if (filePath == null) {
      throw new Error('File path is null');
    }

    await Fs.promises.rm(filePath, options);

    await getFileStatCache().clearFile(this.userFile);
    UserFileWriteable.updateFileIndexDelete(this.userFile);
  }

  getUserFile(): IUserFile {
    return this.userFile;
  }

  protected static updateFileIndexWrite(userFile: IUserFile): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
      ctx.log(`Updating file index for file '${userFile.getPath()}' in '${userFile.getFileSystem().getUniqueId()}'`);
      return fileIndex.refreshIndex(userFile, false, true);
    }, undefined, userFile.getOwner());
  }

  protected static updateFileIndexDelete(userFile: IUserFile): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
      ctx.log(`Deleting file indices for '${userFile.getPath()}' in '${userFile.getFileSystem().getUniqueId()}'`);
      return fileIndex.deleteIndex(userFile);
    }, undefined, userFile.getOwner());
  }

  protected static updateFileIndexRename(src: IUserFile, dest: IUserFileWriteable): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
          ctx.log(`Renames file indices from '${src.getPath()}' in '${src.getFileSystem().getUniqueId()}' to '${dest.getUserFile().getPath()}' in '${dest.getUserFile().getFileSystem().getUniqueId()}'`);

          await fileIndex.renameIndex(src, dest.getUserFile());
        },
        undefined, src.getOwner());
  }

  protected static updateFileIndexMkDir(userFile: IUserFile, recursive: boolean): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
      if (!recursive) {
        ctx.log(`Creating file index for directory '${userFile.getPath()}' in '${userFile.getFileSystem().getUniqueId()}'`);
        return fileIndex.refreshIndex(userFile, false, true);
      }

      ctx.log(`Creating file indices recursively for directory '${userFile.getPath()}' in '${userFile.getFileSystem().getUniqueId()}'`);

      let currentFile = userFile.getFileSystem().getFile('/');

      await fileIndex.refreshIndex(currentFile, false, true);
      for (const pathSegment of userFile.getPath().split('/')) {
        currentFile = userFile.getFileSystem().getFile(Path.join(currentFile.getPath(), pathSegment));
        await fileIndex.refreshIndex(currentFile, false, true);
      }
    }, undefined, userFile.getOwner());
  }
}
