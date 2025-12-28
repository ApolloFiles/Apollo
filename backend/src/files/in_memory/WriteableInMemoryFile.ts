import { container } from 'tsyringe';
import EventRegistry from '../../plugins/builtin/event/EventRegistry.js';
import FileRenamedEvent from '../../plugins/builtin/event/events/FileRenamedEvent.js';
import WriteableVirtualFile from '../WriteableVirtualFile.js';
import type InMemoryFile from './InMemoryFile.js';

export default class WriteableInMemoryFile extends WriteableVirtualFile<InMemoryFile> {
  /**
   * @internal Use {@link InMemoryVirtualFileSystem#acquireWriteLock} instead
   */
  constructor(file: InMemoryFile) {
    super(file);
  }

  async mkdir(): Promise<void> {
    this.throwIfWriteableFileIsNoLongerUsable();
    // no-op
  }

  async write(data: NodeJS.ArrayBufferView): Promise<void> {
    this.throwIfWriteableFileIsNoLongerUsable();

    this.file.setFileData(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }

  async rename(destination: WriteableVirtualFile<InMemoryFile>): Promise<void> {
    this.throwIfWriteableFileIsNoLongerUsable();

    destination.file.setFileData(await this.file.read(), await this.file.stat());
    this.file.deleteFileData();

    await container.resolve(EventRegistry)
      .for(FileRenamedEvent)
      .emit(new FileRenamedEvent(this.file, destination.file));
  }

  async delete(_recursive?: boolean): Promise<void> {
    this.file.deleteFileData();
  }
}
