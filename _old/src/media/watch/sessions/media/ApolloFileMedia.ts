import Fs from 'node:fs/promises';
import Path from 'node:path';
import Utils from '../../../../Utils';
import WebVttKeyframeGenerator from '../../WebVttKeyframeGenerator';
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

    const srcPathOnHost = requestedFile.getAbsolutePathOnHost();

    const hardLinkTargetDir = this.determineHardLinkTargetDir(session);
    const hardLinkFileName = this.generateRandomFileName(this.data.uri);
    this.hardLinkedFilePath = Path.join(hardLinkTargetDir, hardLinkFileName);

    await Fs.mkdir(hardLinkTargetDir, { recursive: true });
    await Utils.createHardLinkAndFallbackToSymbolicLinkIfCrossDevice(srcPathOnHost, this.hardLinkedFilePath);

    const thumbnailsDirName = 'keyframes_' + this.generateRandomFileName();
    await Fs.mkdir(Path.join(session.workingDir.publicPath, thumbnailsDirName), { recursive: true });
    await Fs.writeFile(Path.join(session.workingDir.publicPath, thumbnailsDirName, `${WebVttKeyframeGenerator.VTT_FILE_NAME}.wip`), '');
    new WebVttKeyframeGenerator().generate(this.hardLinkedFilePath, Path.join(session.workingDir.publicPath, thumbnailsDirName))
      .then(() => {
        console.log('Generated thumbnails');
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        return Fs.rm(Path.join(session.workingDir.publicPath, thumbnailsDirName, `${WebVttKeyframeGenerator.VTT_FILE_NAME}.wip`), { force: true });
      });

    this.data = {
      mode: 'native',
      uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(hardLinkFileName)}`,

      metadata: {
        seekThumbnailUri: `./${encodeURIComponent(session.id)}/f/${thumbnailsDirName}/${WebVttKeyframeGenerator.VTT_FILE_NAME}`,
      },
    };
    await super.init(session, issuingClient);
  }

  async cleanup(session: WatchSession): Promise<void> {
    try {
      await Fs.rm(session.workingDir.workingPath, { recursive: true, force: true });
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
