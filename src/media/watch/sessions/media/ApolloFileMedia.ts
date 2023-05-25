import Fs from 'node:fs/promises';
import Path from 'node:path';
import WatchSession from '../WatchSession';
import WatchSessionClient from '../WatchSessionClient';
import BaseSessionMedia from './BaseSessionMedia';

export default class ApolloFileMedia extends BaseSessionMedia {
  protected hardLinkedFilePath?: string;

  async init(session: WatchSession, issuingClient: WatchSessionClient): Promise<void> {
    const requestedFile = issuingClient.getApolloUser().getDefaultFileSystem().getFile(this.data.uri);
    if (!await requestedFile.isFile()) {
      throw new Error('Requested file is not a file');
    }

    const srcPathOnHost = await requestedFile.getAbsolutePathOnHost();
    if (srcPathOnHost == null) {
      throw new Error('Could not get absolute path on host');
    }

    const hardLinkTargetDir = this.determineHardLinkTargetDir(session);
    const hardLinkFileName = this.generateRandomFileName(this.data.uri);
    this.hardLinkedFilePath = Path.join(hardLinkTargetDir, hardLinkFileName);

    await Fs.mkdir(hardLinkTargetDir, {recursive: true});
    await Fs.link(srcPathOnHost, this.hardLinkedFilePath);

    this.data = {
      mode: 'native',
      uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(hardLinkFileName)}`
    };
    await super.init(session, issuingClient);
  }

  async cleanup(session: WatchSession): Promise<void> {
    try {
      await Fs.rm(session.workingDir.workingPath, {recursive: true, force: true});
    } catch (err) {
      if ((err as any).code !== 'ENOTEMPTY') {
        throw err;
      }
      console.error(err);
    }
  }

  protected determineHardLinkTargetDir(session: WatchSession): string {
    return session.workingDir.publicPath;
  }

  protected generateRandomFileName(originalFileName?: string): string {
    return Math.random().toString(36).substring(2) + (originalFileName ? Path.extname(originalFileName) : '');
  }
}
