import Fs from 'node:fs';
import VirtualFile from './VirtualFile.js';

// TODO: Not sure if this should be abstract?
// TODO: Add streaming support
export default abstract class WritableVirtualFile {
  protected constructor(
    public readonly file: VirtualFile,
  ) {
  }

  abstract write(data: NodeJS.ArrayBufferView): Promise<void>;

  abstract move(destination: WritableVirtualFile): Promise<void>;

  abstract moveToTrashBin(): Promise<void>;

  abstract deleteIgnoringTrashBin(options?: Fs.RmOptions): Promise<void> ;
}
