import Fs from 'node:fs';
import Path from 'node:path';
import NodeStream from 'node:stream';
import NodeFsUtils from '../../utils/NodeFsUtils.js';
import VirtualFile from '../VirtualFile.js';
import LocalFileSystem from './LocalFileSystem.js';

export default class LocalFile extends VirtualFile<LocalFileSystem> {
  constructor(fileSystem: LocalFileSystem, path: string) {
    super(fileSystem, path);
  }

  supportsStreaming(): boolean {
    return true;
  }

  async read(): Promise<Buffer> {
    return Fs.promises.readFile(this.getAbsolutePathOnHost());
  }

  createReadStream(options?: { start?: number; end?: number }): NodeStream.Readable {
    return Fs.createReadStream(this.getAbsolutePathOnHost(), options);
  }

  // TODO: This is pretty bad for directories with many files, can we do better?
  async getFiles(): Promise<LocalFile[]> {
    if (!(await this.isDirectory())) {
      // TODO: Proper Exception class
      throw new Error(`${this.path} is not a directory`);
    }

    const fileNames = await NodeFsUtils.readdirIfExists(this.getAbsolutePathOnHost());

    const result: LocalFile[] = [];
    for (const file of fileNames) {
      result.push(this.fileSystem.getFile(Path.join(this.path, file)));
    }

    return result;
  }

  async stat(): Promise<Fs.Stats> {
    if (this.path === '/') {
      await Fs.promises.mkdir(this.getAbsolutePathOnHost(), { recursive: true });
    }

    return Fs.promises.stat(this.getAbsolutePathOnHost());
  }

  public getAbsolutePathOnHost(): string {
    return Path.join(this.fileSystem.getAbsolutePathOnHost(), this.path);
  }
}
