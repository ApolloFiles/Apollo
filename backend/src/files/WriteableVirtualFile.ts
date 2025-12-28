import Path from 'node:path';
import VirtualFile from './VirtualFile.js';

// TODO: Add streaming support
export default abstract class WriteableVirtualFile<T extends VirtualFile = VirtualFile> {
  private lockHasBeenRelease = false;

  protected constructor(
    public readonly file: T,
  ) {
  }

  abstract mkdir(): Promise<void>;

  abstract write(data: NodeJS.ArrayBufferView): Promise<void>;

  abstract rename(destination: WriteableVirtualFile<T>): Promise<void>;

  abstract delete(recursive?: boolean): Promise<void>;

  getChildFile(child: string): WriteableVirtualFile<T> {
    return this.file.fileSystem.getWriteableFile(this.file.fileSystem.getFile(Path.join(this.file.path, child))) as WriteableVirtualFile<T>;
  }

  protected throwIfWriteableFileIsNoLongerUsable(): void {
    if (this.hasLockBeenReleased()) {
      throw new Error('Write operation failed, because the writeable-file is no-longer usable (use-after-release; Did the lease time expired?)');
    }
  }

  setLockHasBeenReleased(): void {
    this.lockHasBeenRelease = true;
  }

  protected hasLockBeenReleased(): boolean {
    return this.lockHasBeenRelease;
  }
}
