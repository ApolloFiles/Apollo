import Fs from 'fs';
import { Abortable } from 'node:events';
import { Mode, ObjectEncodingOptions, OpenMode } from 'node:fs';
import Stream from 'node:stream';

export default interface IUserFileWriteable {
  write(
      data: string | NodeJS.ArrayBufferView | Iterable<string | NodeJS.ArrayBufferView> | AsyncIterable<string | NodeJS.ArrayBufferView> | Stream,
      options?: (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; } & Abortable) | BufferEncoding
  ): Promise<void>;
  mkdir(options?: Fs.MakeDirectoryOptions): Promise<void>;

  // getWriteStream(): Promise<NodeJS.WritableStream>;

  moveToTrashBin(): Promise<void>;
  deleteIgnoringTrashBin(options?: Fs.RmOptions): Promise<void>;
}
