import Fs from 'node:fs';
import NodeStream from 'node:stream';
import VirtualFile from '../VirtualFile.js';
import type InMemoryVirtualFileSystem from './InMemoryVirtualFileSystem.js';

export default class InMemoryFile extends VirtualFile<InMemoryVirtualFileSystem> {
  private fileData: { bytes: Buffer, stat: Fs.Stats } | null = null;

  constructor(fileSystem: InMemoryVirtualFileSystem, path: string) {
    super(fileSystem, path);
  }

  deleteFileData(): void {
    this.fileData = null;
  }

  setFileData(bytes: Buffer, stat?: Fs.Stats): void {
    if (stat == null) {
      const blksize = 4096;
      const atime = new Date();
      const mtime = new Date();
      const ctime = this.fileData?.stat.ctime ?? new Date();
      const birthtime = this.fileData?.stat.birthtime ?? new Date();

      stat = {
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,


        ino: this.fileData?.stat.ino ?? Date.now(), // pseudo-unique inode for in-memory file
        dev: 0, // device ID of 0, as we are not on a real device
        rdev: 0, // not a device file
        nlink: 1, // only one link in memory
        mode: 0o100644, // rw-r--r--

        uid: this.fileData?.stat.uid ?? process.getuid?.() ?? 0,
        gid: this.fileData?.stat.gid ?? process.getgid?.() ?? 0,

        size: bytes.byteLength,
        blksize, // typical block size
        blocks: Math.ceil(bytes.byteLength / blksize),

        atimeMs: atime.getTime(),
        mtimeMs: mtime.getTime(),
        ctimeMs: ctime.getTime(),
        birthtimeMs: birthtime.getTime(),
        atime,
        mtime,
        ctime,
        birthtime,
      };
    }

    this.fileData = { bytes, stat };
  }

  supportsStreaming(): boolean {
    return true;
  }

  async read(): Promise<Buffer> {
    if (this.fileData == null) {
      throw new Error('Cannot read InMemoryFile that has no data/has not been written to yet');
    }
    return this.fileData.bytes;
  }

  createReadStream(options?: { start?: number; end?: number }): NodeStream.Readable {
    if (!this.fileData) {
      throw new Error('No file data in memory');
    }

    const start = options?.start ?? 0;
    const end = options?.end ?? (this.fileData.bytes.length - 1);

    const stream = new NodeStream.Readable();
    stream.push(this.fileData.bytes.subarray(start, end + 1));
    stream.push(null);
    return stream;
  }

  async getFiles(): Promise<InMemoryFile[]> {
    throw new Error('#getFiles is not implemented for in-memory files');
  }

  async stat(): Promise<Fs.Stats> {
    if (this.fileData == null) {
      throw new Error('Cannot stat InMemoryFile that has no data/has not been written to yet');
    }
    return this.fileData.stat;
  }
}
