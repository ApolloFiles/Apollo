import Fs from 'node:fs';
import { Abortable } from 'node:events';
import { Mode, ObjectEncodingOptions, OpenMode } from 'node:fs';
import Stream from 'node:stream';
import IUserFile from './IUserFile';

export default interface IUserFileWriteable {
  write(
      data: string | NodeJS.ArrayBufferView | Iterable<string | NodeJS.ArrayBufferView> | AsyncIterable<string | NodeJS.ArrayBufferView> | Stream,
      options?: (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; } & Abortable) | BufferEncoding
  ): Promise<void>;
  mkdir(options?: Fs.MakeDirectoryOptions): Promise<void>;
  move(destination: IUserFileWriteable): Promise<void>;

  // getWriteStream(): Promise<NodeJS.WritableStream>;

  moveToTrashBin(): Promise<void>;
  deleteIgnoringTrashBin(options?: Fs.RmOptions): Promise<void>;

  getUserFile(): IUserFile;
}
