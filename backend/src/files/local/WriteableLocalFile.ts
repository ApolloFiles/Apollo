import Fs from 'node:fs';
import Path from 'node:path';
import { container } from 'tsyringe';
import EventRegistry from '../../plugins/builtin/event/EventRegistry.js';
import FileRenamedEvent from '../../plugins/builtin/event/events/FileRenamedEvent.js';
import WriteableVirtualFile from '../WriteableVirtualFile.js';
import type LocalFile from './LocalFile.js';

export default class WriteableLocalFile extends WriteableVirtualFile<LocalFile> {
  /**
   * @internal Use {@link LocalFileSystem#acquireWriteLock} instead
   */
  constructor(file: LocalFile) {
    super(file);
  }

  async mkdir(): Promise<void> {
    this.throwIfWriteableFileIsNoLongerUsable();

    await Fs.promises.mkdir(this.file.getAbsolutePathOnHost(), { recursive: true });
  }

  async write(data: NodeJS.ArrayBufferView): Promise<void> {
    this.throwIfWriteableFileIsNoLongerUsable();

    await Fs.promises.mkdir(Path.dirname(this.file.getAbsolutePathOnHost()), { recursive: true });
    await Fs.promises.writeFile(this.file.getAbsolutePathOnHost(), data);
  }

  async rename(destination: WriteableVirtualFile<LocalFile>): Promise<void> {
    this.throwIfWriteableFileIsNoLongerUsable();

    await Fs.promises.mkdir(Path.dirname(destination.file.getAbsolutePathOnHost()), { recursive: true });
    await Fs.promises.rename(this.file.getAbsolutePathOnHost(), destination.file.getAbsolutePathOnHost());

    await container.resolve(EventRegistry)
      .for(FileRenamedEvent)
      .emit(new FileRenamedEvent(this.file, destination.file));
  }
}
