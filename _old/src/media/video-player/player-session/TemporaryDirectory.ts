import Path from 'node:path';
import { getAppTmpDir } from '../../../Constants';

export default class TemporaryDirectory {
  public readonly directoryPath: string;
  public readonly workSubDirPath: string;
  public readonly publicSubDirPath: string;

  private constructor(directoryPath: string) {
    if (!Path.isAbsolute(directoryPath)) {
      throw new Error('Working path must be absolute');
    }

    this.directoryPath = directoryPath;

    this.workSubDirPath = Path.join(this.directoryPath, 'work');
    this.publicSubDirPath = Path.join(this.directoryPath, 'public');
  }

  static create(uid: string): TemporaryDirectory {
    return new TemporaryDirectory(Path.join(getAppTmpDir(), 'media', 'video-player-session', uid));
  }
}
