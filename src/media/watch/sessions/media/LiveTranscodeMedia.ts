import Fs from 'node:fs';
import Path from 'path';
import WrappedGstAppProcess from '../../live_transcode/gst_app/GstAppProcessWrapper';
import GstVideoLiveTranscode from '../../live_transcode/gst_app/GstVideoLiveTranscode';
import LiveTranscodeManifestGenerator from '../../live_transcode/LiveTranscodeManifestGenerator';
import WatchSession from '../WatchSession';
import WatchSessionClient from '../WatchSessionClient';
import ApolloFileMedia from './ApolloFileMedia';

export default class LiveTranscodeMedia extends ApolloFileMedia {
  private gstLiveTranscode?: WrappedGstAppProcess;

  async init(session: WatchSession, issuingClient: WatchSessionClient): Promise<void> {
    await super.init(session, issuingClient);

    const transcodeDirName = this.generateRandomFileName();
    const transcodeTargetDir = Path.join(session.workingDir.publicPath, transcodeDirName);
    await Fs.promises.mkdir(transcodeTargetDir, {recursive: true});

    this.gstLiveTranscode = await GstVideoLiveTranscode.startTranscode(this.hardLinkedFilePath!, transcodeTargetDir);
    const manifestGenerator = new LiveTranscodeManifestGenerator(this.hardLinkedFilePath!, transcodeTargetDir, this.gstLiveTranscode);

    const manifest = await manifestGenerator.generateManifest();
    this.data = {
      mode: 'live_transcode',
      uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/${manifest.manifestFileName}`,
      duration: manifest.duration
    };
  }

  async cleanup(session: WatchSession): Promise<void> {
    await this.gstLiveTranscode?.terminate();
    return super.cleanup(session);
  }

  protected determineHardLinkTargetDir(session: WatchSession): string {
    return session.workingDir.workingPath;
  }
}
