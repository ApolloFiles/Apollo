import Path from 'node:path';
import { container } from 'tsyringe';
import ApolloDirectoryProvider from '../../../../../../config/ApolloDirectoryProvider.js';

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
    return new TemporaryDirectory(Path.join(container.resolve(ApolloDirectoryProvider).getAppTemporaryDirectory(), 'media', 'video-player-session', uid));
  }
}
