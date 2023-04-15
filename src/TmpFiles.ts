import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { getAppTmpDir } from './Constants';

export default class TmpFiles {
  // TODO: Honor a given ttl and have startUp and shutdown tasks to clean up files
  // TODO: Allow user tmp dirs too
  static createTmpDir(ttlSeconds: number | null = 14_400 /* 4h */, uniqueIdentifier?: string): string {
    const tmpDir = Path.join(getAppTmpDir(), `${uniqueIdentifier ?? Crypto.randomUUID()}`);

    Fs.mkdirSync(tmpDir, {recursive: true});
    return tmpDir;
  }
}
