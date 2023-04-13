import Fs from 'node:fs';
import Path from 'node:path';
import { getAppTmpDir } from '../../../Constants';

export default class TemporaryDirectory {
  public readonly workingPath: string;
  public readonly publicPath: string;

  private constructor(workingPath: string) {
    if (!Path.isAbsolute(workingPath)) {
      throw new Error('Working path must be absolute');
    }

    this.workingPath = workingPath;
    this.publicPath = Path.join(workingPath, 'public');
  }

  static create(uid: string): TemporaryDirectory {
    const tmpDir = Path.join(getAppTmpDir(), 'watch', 'sessions', uid); // TODO: Make this whole path generation more portable/reusable
    Fs.mkdirSync(tmpDir, {recursive: true});
    return new TemporaryDirectory(tmpDir);
  }
}
