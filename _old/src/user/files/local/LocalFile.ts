import * as FastDirectorySize from 'fast-directory-size';
import Fs from 'node:fs';
import Path from 'node:path';
import NodeStream from 'node:stream';
import { getFileStatCache, getFileTypeUtils } from '../../../Constants';
import VirtualFile from '../VirtualFile';
import LocalFileSystem from './LocalFileSystem';

export default class LocalFile extends VirtualFile<LocalFileSystem> {
  /** @deprecated This only exists to ease the transition to the new file abstraction implementation */
  private cachedGeneratedCacheId: string | undefined;

  constructor(fileSystem: LocalFileSystem, path: string) {
    super(fileSystem, path);
  }

  getAbsolutePathOnHost(): string {
    return Path.join(this.fileSystem.getAbsolutePathOnHost(), this.path);
  }

  async read(): Promise<Buffer> {
    return Fs.promises.readFile(this.getAbsolutePathOnHost());
  }

  getReadStream(options?: { start?: number, end?: number }): NodeStream.Readable {
    return Fs.createReadStream(this.getAbsolutePathOnHost(), options);
  }

  async getFiles(): Promise<LocalFile[]> {
    if (!(await this.isDirectory())) {
      throw new Error(`${this.path} is not a directory`);
    }

    const fileNames = await Fs.promises.readdir(this.getAbsolutePathOnHost());

    const result: LocalFile[] = [];
    for (const file of fileNames) {
      result.push(this.fileSystem.getFile(Path.join(this.path, file)));
    }

    return result;
  }

  async stat(forceRefresh: boolean = false): Promise<Fs.Stats> {
    if (!forceRefresh) {
      const cachedStat = await getFileStatCache().getStat(this);
      if (cachedStat != null) {
        return cachedStat;
      }
    }

    const fileStat = await Fs.promises.stat(this.getAbsolutePathOnHost());
    await getFileStatCache().setStat(this, fileStat);
    return fileStat;
  }

  async getSize(forceRefresh?: boolean): Promise<number> {
    if (await this.isFile()) {
      return this.stat(forceRefresh).then((stat) => stat.size);
    }

    if (!(await this.isDirectory())) {
      return -1;
    }

    if (!forceRefresh) {
      const cachedSize = await getFileStatCache().getDirectorySize(this.getAbsolutePathOnHost());
      if (cachedSize != null) {
        return cachedSize;
      }
    }

    const size = await FastDirectorySize.getDirectorySize(this.getAbsolutePathOnHost());
    await getFileStatCache().setDirectorySize(this.getAbsolutePathOnHost(), size);
    return size;
  }

  async getMimeType(forceRefresh: boolean = false): Promise<string | null> {
    if (!forceRefresh) {
      const cachedMimeType = await getFileStatCache().getMimeType(this);
      if (cachedMimeType !== undefined) {
        return cachedMimeType;
      }
    }

    let mimeType = null;
    if (await this.isFile()) {
      mimeType = await getFileTypeUtils().getMimeType(this.getAbsolutePathOnHost());
    }

    await getFileStatCache().setMimeType(this, mimeType);
    return mimeType;
  }

  /** @deprecated This only exists to ease the transition to the new file abstraction implementation */
  async generateCacheId(forceRefresh: boolean = false): Promise<string> {
    if (forceRefresh || this.cachedGeneratedCacheId == null) {
      let fileStat = { mtimeMs: -1, size: -1 };
      try {
        fileStat = await Fs.promises.stat(this.getAbsolutePathOnHost());
      } catch (fileNotExists) {
      }

      this.cachedGeneratedCacheId = Buffer.from(this.getAbsolutePathOnHost() + ';' + fileStat.mtimeMs + ';' + fileStat.size)
        .toString('base64');
    }

    return this.cachedGeneratedCacheId;
  }
}
