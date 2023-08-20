import Fs from 'node:fs';
import Path from 'path';
import WrappedGstAppProcess from '../../live_transcode/gst_app/GstAppProcessWrapper';
import GstVideoLiveTranscode from '../../live_transcode/gst_app/GstVideoLiveTranscode';
import LiveTranscodeManifestGenerator from '../../live_transcode/LiveTranscodeManifestGenerator';
import {BackendDebugInfoMessage} from '../CommunicationProtocol';
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

    const onDebugData: (debugData: BackendDebugInfoMessage['data']) => void = (debugData) => {
      session._broadcast<BackendDebugInfoMessage>({type: 'backendDebugInfo', data: debugData});
    };
    this.gstLiveTranscode = await GstVideoLiveTranscode.startTranscode(this.hardLinkedFilePath!, transcodeTargetDir, onDebugData);
    const manifestGenerator = new LiveTranscodeManifestGenerator(this.hardLinkedFilePath!, transcodeTargetDir, this.gstLiveTranscode);

    const manifest = await manifestGenerator.generateManifest();
    this.data = {
      mode: 'live_transcode',
      uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/${encodeURIComponent(manifest.manifestFileName)}`,
      duration: manifest.duration,
      metadata: {
        subtitles: manifest.subtitleMetadata.map((subtitleMetadata) => {
          return {
            title: subtitleMetadata.title,
            language: subtitleMetadata.language,
            codecName: subtitleMetadata.codecName,
            uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/${Path.join('./', subtitleMetadata.uri)}`
          };
        }),
        fonts: manifest.fontMetadata.map((fontMetadata) => {
          return {
            uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/${Path.join('./', fontMetadata.uri)}`
          };
        })
      }
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
