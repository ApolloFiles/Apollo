import Fs from 'node:fs';
import Path from 'node:path';
import VideoAnalyser from '../../../video/analyser/VideoAnalyser';
import FontExtractor, {ExtractedFont} from '../../live_transcode/extractor/FontExtractor';
import TextBasedSubtitleExtractor from '../../live_transcode/extractor/TextBasedSubtitleExtractor';
import FfmpegProcess from '../../live_transcode/FfmpegProcess';
import LiveTranscode from '../../live_transcode/LiveTranscode';
import {BackendDebugInfoMessage} from '../CommunicationProtocol';
import WatchSession from '../WatchSession';
import WatchSessionClient from '../WatchSessionClient';
import ApolloFileMedia from './ApolloFileMedia';

export default class LiveTranscodeMedia extends ApolloFileMedia {
  private ffmpegProcess?: FfmpegProcess;

  async init(session: WatchSession, issuingClient: WatchSessionClient): Promise<void> {
    await super.init(session, issuingClient);
    if (this.hardLinkedFilePath == null) {
      throw new Error('Hard link file path is null');
    }

    const transcodeDirName = this.generateRandomFileName();
    const transcodeTargetDir = Path.join(session.workingDir.publicPath, transcodeDirName);
    await Fs.promises.mkdir(transcodeTargetDir, {recursive: true});

    const videoAnalysis = await VideoAnalyser.analyze(this.hardLinkedFilePath, true);

    const transcode = await LiveTranscode.startLiveTranscode(this.hardLinkedFilePath, transcodeTargetDir);
    this.ffmpegProcess = transcode.process;
    transcode.process.on('metrics', (metrics) => {
      session._broadcast<BackendDebugInfoMessage>({
        type: 'backendDebugInfo',
        data: {
          videoEncoder: transcode.videoEncoder,
          ...metrics
        }
      });
    });

    const textBasedSubtitlesDir = Path.join(transcodeTargetDir, '_subtitles');
    const textBasedSubtitles = await TextBasedSubtitleExtractor.extract(this.hardLinkedFilePath, videoAnalysis, textBasedSubtitlesDir);

    let subtitleFonts: ExtractedFont[] = [];
    if (textBasedSubtitles.length > 0) {
      const fontsDir = Path.join(textBasedSubtitlesDir, 'fonts');

      try {
        subtitleFonts = await FontExtractor.extract(this.hardLinkedFilePath, videoAnalysis, fontsDir);
      } catch (err) {
        console.error('Failed to extract fonts from video', err);
      }
    }

    await this.waitForFileToExist(Path.join(transcodeTargetDir, 'master.m3u8'), 10_000);

    this.data = {
      mode: 'live_transcode',
      uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/master.m3u8`,
      duration: transcode.mediaDuration,
      metadata: {
        subtitles: textBasedSubtitles.map((subtitle) => {
          return {
            title: subtitle.title,
            language: subtitle.language,
            codecName: subtitle.codecName,
            uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/_subtitles/${encodeURIComponent(subtitle.fileName)}`
          };
        }),
        fonts: subtitleFonts.map((font) => {
          return {
            uri: `./${encodeURIComponent(session.id)}/f/${encodeURIComponent(transcodeDirName)}/_subtitles/fonts/${encodeURIComponent(font.fileName)}`
          };
        })
      }
    };
  }

  private async waitForFileToExist(filePath: string, timeoutInMillis: number): Promise<void> {
    while (!Fs.existsSync(filePath)) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      timeoutInMillis -= 100;
      if (timeoutInMillis <= 0) {
        throw new Error(`Timeout waiting for file ${filePath} to exist`);
      }
    }
  }

  async cleanup(session: WatchSession): Promise<void> {
    await this.ffmpegProcess?.terminate();
    return super.cleanup(session);
  }

  protected determineHardLinkTargetDir(session: WatchSession): string {
    return session.workingDir.workingPath;
  }
}
