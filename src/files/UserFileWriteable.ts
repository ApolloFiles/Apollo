import express from 'express';
import * as NodeEvents from 'node:events';
import Fs from 'node:fs';
import Path from 'node:path';
import * as NodeStream from 'node:stream';
import { getFileStatCache } from '../Constants';
import BackgroundProcess from '../process_manager/BackgroundProcess';
import LocalFile from '../user/files/local/LocalFile';
import FileIndex from './index/FileIndex';

/** @deprecated This class is part of the old file abstraction and needs to be re-implemented into the new file abstraction */
export default class UserFileWriteable {
  protected readonly req: express.Request;
  protected readonly userFile: LocalFile;

  constructor(req: express.Request, userFile: LocalFile) {
    this.req = req;
    this.userFile = userFile;
  }

  async write(
    data: string | NodeJS.ArrayBufferView | Iterable<string | NodeJS.ArrayBufferView> | AsyncIterable<string | NodeJS.ArrayBufferView> | NodeStream,
    options?: (Fs.ObjectEncodingOptions & { mode?: Fs.Mode | undefined; flag?: Fs.OpenMode | undefined; } & NodeEvents.Abortable) | BufferEncoding | null
  ): Promise<void> {
    const filePath = this.userFile.getAbsolutePathOnHost();

    const firstDirCreated = await Fs.promises.mkdir(Path.dirname(filePath), { recursive: true });
    await Fs.promises.writeFile(filePath, data, options);

    await getFileStatCache().clearFile(this.userFile);
    this.updateFileIndexMkDir(this.userFile, firstDirCreated != null);
    this.updateFileIndexWrite(this.userFile);
  }

  async mkdir(options?: Fs.MakeDirectoryOptions): Promise<void> {
    const firstDirCreated = await Fs.promises.mkdir(this.userFile.getAbsolutePathOnHost(), options);

    await getFileStatCache().clearFile(this.userFile);
    this.updateFileIndexMkDir(this.userFile, firstDirCreated != null);
  }

  async move(destination: UserFileWriteable): Promise<void> {
    const srcPath = this.userFile.getAbsolutePathOnHost();
    const destPath = destination.getUserFile().getAbsolutePathOnHost();
    await Fs.promises.rename(srcPath, destPath);

    await getFileStatCache().clearFile(this.userFile);
    await getFileStatCache().clearFile(destination.getUserFile());
    this.updateFileIndexRename(this.userFile, destination);
  }

  async moveToTrashBin(): Promise<void> {
    if (this.userFile.fileSystem.getAbsolutePathOnHost() == this.userFile.fileSystem.owner.getTrashBinFileSystem().getAbsolutePathOnHost()) {
      throw new Error('File is already in trash bin');
    }

    const targetFileSystem = this.userFile.fileSystem.owner.getTrashBinFileSystem();
    const targetFile = targetFileSystem.getFile(this.userFile.path);

    await targetFileSystem.acquireLock(this.req, targetFile, async (writeableFile) => {
      await targetFileSystem.acquireLock(
        this.req,
        targetFileSystem.getFile(Path.dirname(targetFile.path)),
        (writeableParentFile) => writeableParentFile.mkdir({ recursive: true }),
      );

      if (!(await targetFile.exists())) {
        return this.move(writeableFile);
      }

      let newTargetFile: LocalFile;
      let counter = 0;
      let loop = true;
      while (loop) {
        ++counter;

        newTargetFile = targetFileSystem.getFile(Path.join(Path.dirname(targetFile.path), Path.basename(targetFile.path, Path.extname(targetFile.path)) + '~' + counter + Path.extname(targetFile.path)));
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
    await Fs.promises.rm(this.userFile.getAbsolutePathOnHost(), options);

    await getFileStatCache().clearFile(this.userFile);
    this.updateFileIndexDelete(this.userFile);
  }

  getUserFile(): LocalFile {
    return this.userFile;
  }

  private updateFileIndexWrite(userFile: LocalFile): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
      ctx.log(`Updating file index for file '${userFile.path}' in '${userFile.fileSystem.getUniqueId()}'`);
      return fileIndex.refreshIndex(userFile, false, true);
    }, undefined, userFile.fileSystem.owner);
  }

  private updateFileIndexDelete(userFile: LocalFile): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
      ctx.log(`Deleting file indices for '${userFile.path}' in '${userFile.fileSystem.getUniqueId()}'`);
      return fileIndex.deleteIndex(userFile);
    }, undefined, userFile.fileSystem.owner);
  }

  private updateFileIndexRename(src: LocalFile, dest: UserFileWriteable): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
        ctx.log(`Renames file indices from '${src.path}' in '${src.fileSystem.getUniqueId()}' to '${dest.getUserFile().path}' in '${dest.getUserFile().fileSystem.getUniqueId()}'`);

        await fileIndex.renameIndex(src, dest.getUserFile());
      },
      undefined, src.fileSystem.owner);
  }

  private updateFileIndexMkDir(userFile: LocalFile, recursive: boolean): void {
    const fileIndex = FileIndex.getInstance();
    if (fileIndex == null) {
      return;
    }

    new BackgroundProcess<void>(async (ctx) => {
      if (!recursive) {
        ctx.log(`Creating file index for directory '${userFile.path}' in '${userFile.fileSystem.getUniqueId()}'`);
        return fileIndex.refreshIndex(userFile, false, true);
      }

      ctx.log(`Creating file indices recursively for directory '${userFile.path}' in '${userFile.fileSystem.getUniqueId()}'`);

      let currentFile = userFile.fileSystem.getFile('/');

      await fileIndex.refreshIndex(currentFile, false, true);
      for (const pathSegment of userFile.path.split('/')) {
        currentFile = userFile.fileSystem.getFile(Path.join(currentFile.path, pathSegment));
        await fileIndex.refreshIndex(currentFile, false, true);
      }
    }, undefined, userFile.fileSystem.owner);
  }
}
