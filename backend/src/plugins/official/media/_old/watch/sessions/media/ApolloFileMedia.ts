import Fs from 'node:fs';
import Path from 'node:path';
import { container } from 'tsyringe';
import FileSystemProvider from '../../../../../../../files/FileSystemProvider.js';
import LocalFileSystem from '../../../../../../../files/local/LocalFileSystem.js';
import WebVttKeyframeGenerator from '../../WebVttKeyframeGenerator.js';
import type WatchSession from '../WatchSession.js';
import type WatchSessionClient from '../WatchSessionClient.js';
import BaseSessionMedia from './BaseSessionMedia.js';

export default class ApolloFileMedia extends BaseSessionMedia {
  protected hardLinkedFilePath?: string;

  async init(session: WatchSession, issuingClient: WatchSessionClient): Promise<void> {
    const fileSystems = await container.resolve(FileSystemProvider).provideForUser(issuingClient.getApolloUser());
    const defaultFileSystem = fileSystems.user[0];
    if (!(defaultFileSystem instanceof LocalFileSystem)) {
      throw new Error('Default file system is not a local file system');
    }

    const requestedFile = defaultFileSystem.getFile(this.data.uri);
    if (!(await requestedFile.isFile())) {
      throw new Error('Requested file is not a file');
    }

    const srcPathOnHost = requestedFile.getAbsolutePathOnHost();

    const hardLinkTargetDir = this.determineHardLinkTargetDir(session);
    const hardLinkFileName = this.generateRandomFileName(this.data.uri);
    this.hardLinkedFilePath = Path.join(hardLinkTargetDir, hardLinkFileName);

    await Fs.promises.mkdir(hardLinkTargetDir, { recursive: true });
    await Fs.promises.symlink(srcPathOnHost, this.hardLinkedFilePath);

    const thumbnailsDirName = 'keyframes_' + this.generateRandomFileName();
    await Fs.promises.mkdir(Path.join(session.workingDir.publicPath, thumbnailsDirName), { recursive: true });
    await Fs.promises.writeFile(Path.join(session.workingDir.publicPath, thumbnailsDirName, `${WebVttKeyframeGenerator.VTT_FILE_NAME}.wip`), '');
    new WebVttKeyframeGenerator().generate(this.hardLinkedFilePath, Path.join(session.workingDir.publicPath, thumbnailsDirName))
      .then(() => {
        console.log('Generated thumbnails');
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        return Fs.promises.rm(Path.join(session.workingDir.publicPath, thumbnailsDirName, `${WebVttKeyframeGenerator.VTT_FILE_NAME}.wip`), { force: true });
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
      await Fs.promises.rm(session.workingDir.workingPath, { recursive: true, force: true });
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
