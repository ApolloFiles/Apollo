import {StringUtils} from '@spraxdev/node-commons';
import Fs from 'node:fs';
import Path from 'node:path';
import {getFileNameCollator} from '../../../Constants';
import ProcessBuilder from '../../../process_manager/ProcessBuilder';
import VideoAnalyser from '../../video/analyser/VideoAnalyser';
import {ExtendedVideoAnalysis, Stream, SubtitleStream, VideoStream} from '../../video/analyser/VideoAnalyser.Types';
import * as CommunicationProtocol from '../sessions/CommunicationProtocol';
import GstAppProcessWrapper from './gst_app/GstAppProcessWrapper';
import {ISO639_2ToISO639_1Mapping} from './language/ISO639_2ToISO639_1Mapping';

export type LiveTranscodeManifest = {
  manifestFileName: string,
  duration: number,

  subtitleMetadata: CommunicationProtocol.SubtitleMetadata[],
  fontMetadata: { uri: string }[]
}

// TODO: Check the subtitle formats listed below (supported by ffmpeg) and add support for them (we might need to convert them into a client-side supported format first)
//   DES... dvb_subtitle         DVB subtitles (decoders: dvbsub ) (encoders: dvbsub )
//   DES... dvd_subtitle         DVD subtitles (decoders: dvdsub ) (encoders: dvdsub )
//   D.S... hdmv_pgs_subtitle    HDMV Presentation Graphic Stream subtitles (decoders: pgssub )
//   ..S... hdmv_text_subtitle   HDMV Text subtitle
//   D.S... jacosub              JACOsub subtitle
//   D.S... microdvd             MicroDVD subtitle
//   D.S... mpl2                 MPL2 subtitle
//   D.S... pjs                  PJS (Phoenix Japanimation Society) subtitle
//   D.S... realtext             RealText subtitle
//   D.S... sami                 SAMI subtitle
//   ..S... srt                  SubRip subtitle with embedded timing
//   D.S... stl                  Spruce subtitle format
//   DES... subrip               SubRip subtitle (decoders: srt subrip ) (encoders: srt subrip )
//   D.S... subviewer            SubViewer subtitle
//   D.S... subviewer1           SubViewer v1 subtitle
//   D.S... vplayer              VPlayer subtitle
const supportedSubtitleCodecsAndTheirExtension: { [codec: string]: string } = {
  'ass': 'ass',
  'ssa': 'ssa',
  'webvtt': 'vtt'
};

export default class LiveTranscodeManifestGenerator {
  private readonly videoFile: string;
  private readonly publicDir: string;
  private readonly gstApp: GstAppProcessWrapper;

  private manifest?: LiveTranscodeManifest;

  constructor(videoFile: string, publicDir: string, gstApp: GstAppProcessWrapper) {
    if (!Path.isAbsolute(videoFile)) {
      throw new Error('videoFile must be an absolute path');
    }

    this.videoFile = videoFile;
    this.publicDir = publicDir;
    this.gstApp = gstApp;
  }

  async generateManifest(): Promise<LiveTranscodeManifest> {
    if (this.manifest != null) {
      return this.manifest;
    }

    const videoAnalysis = await VideoAnalyser.analyze(this.videoFile, true);
    const videoManifest = await this.gstApp.waitForVideoManifest();

    const subtitleMetadata: CommunicationProtocol.SubtitleMetadata[] = [];
    const fontMetadata: { uri: string }[] = [];

    const firstSegmentPath = Path.join(Path.dirname(videoManifest.path), '0.ts');
    try {
      subtitleMetadata.push(...(await this.generateSubtitleMetadata(videoAnalysis)));
    } catch (err: any) {
      console.log(err);
    }

    try {
      fontMetadata.push(...(await this.generateFontMetadata(videoAnalysis)));
    } catch (err: any) {
      console.log(err);
    }

    let masterPlaylist = '#EXTM3U\n' +
      '#EXT-X-VERSION:7\n' +
      '\n';

    // TODO: Supply gst app with target resolution and framerate and use these values here instead of probing the first segment
    const firstFragmentAnalysis = await VideoAnalyser.analyze(firstSegmentPath, true);
    const videoStream = firstFragmentAnalysis.streams.find(s => s.codecType === 'video') as VideoStream;
    const videoResolution = `${videoStream.width}x${videoStream.height}`;

    let videoFramerate = 30;
    if (StringUtils.isNumeric(videoStream.avgFrameRate)) {
      videoFramerate = parseInt(videoStream.avgFrameRate, 10);
    } else if (videoStream.avgFrameRate.includes('/')) {
      const [num, den] = videoStream.avgFrameRate.split('/');
      videoFramerate = parseInt(num, 10) / parseInt(den, 10);
    }

    masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=10101000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=${videoResolution},FRAME-RATE=${videoFramerate}`; // FIXME: BANDWIDTH, CODECS
    masterPlaylist += '\n';
    masterPlaylist += Path.relative(this.publicDir, videoManifest.path) + '\n';

    await Fs.promises.writeFile(Path.join(this.publicDir, 'master.m3u8'), masterPlaylist);

    this.manifest = {
      manifestFileName: 'master.m3u8',
      duration: videoManifest.duration,
      subtitleMetadata,
      fontMetadata
    };
    return this.manifest;
  }

  private async generateSubtitleMetadata(videoAnalysis: ExtendedVideoAnalysis): Promise<CommunicationProtocol.SubtitleMetadata[]> {
    const subtitleMetadata: CommunicationProtocol.SubtitleMetadata[] = [];

    for (const stream of videoAnalysis.streams) {
      if (!this.isSupportedTextBasedSubtitleStream(stream)) {
        continue;
      }

      let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
      if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
        iso639_2LanguageTag = 'und';
      }

      const iso639_1LanguageTag = (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag);
      const streamTitle = (stream.tags.title ?? iso639_1LanguageTag).replace(/"/g, ''); // TODO: Do we have to remove "?

      const subtitleTargetPath = Path.join(this.publicDir, 'apollo_subs', `${iso639_1LanguageTag}.${stream.index}.${supportedSubtitleCodecsAndTheirExtension[stream.codecName]}`);
      const ffmpegArgs = [
        '-bitexact',
        '-n',

        '-i', this.videoFile,

        '-map', `0:${stream.index}`,
        '-c:s', 'copy',

        subtitleTargetPath
      ];

      await Fs.promises.mkdir(Path.dirname(subtitleTargetPath), {recursive: true});
      await new ProcessBuilder('ffmpeg', ffmpegArgs)
        .errorOnNonZeroExit()
        .withCwd(this.publicDir)
        .runPromised();

      subtitleMetadata.push({
        title: streamTitle,
        language: iso639_1LanguageTag,
        codecName: stream.codecName,
        uri: Path.relative(this.publicDir, subtitleTargetPath)
      });
    }

    return subtitleMetadata;
  }

  private async generateFontMetadata(videoAnalysis: ExtendedVideoAnalysis): Promise<{ uri: string }[]> {
    const fonts: { uri: string }[] = [];

    // extract all ttf and otf fonts
    for (const stream of videoAnalysis.streams) {
      if (stream.codecType !== 'attachment' || typeof stream.tags?.filename != 'string') {
        continue;
      }

      if (!['ttf', 'otf', 'woff'].includes(stream.codecName)) {
        console.warn('Skipping unsupported font attachment:', stream);
      }

      const fontTargetPath = Path.join(this.publicDir, 'apollo_fonts', stream.tags.filename);
      const ffmpegArgs = [
        '-bitexact',
        '-n',

        `-dump_attachment:${stream.index}`,
        fontTargetPath,

        '-i', this.videoFile
      ];

      await Fs.promises.mkdir(Path.dirname(fontTargetPath), {recursive: true});
      await new ProcessBuilder('ffmpeg', ffmpegArgs)
        .errorOnNonZeroExit()
        .withCwd(this.publicDir)
        .runPromised();

      fonts.push({uri: Path.relative(this.publicDir, fontTargetPath)});
    }

    return fonts;
  }

  private async generateSubtitleManifests(videoAnalysis: ExtendedVideoAnalysis, firstFramePts: number): Promise<{
    iso639_2LanguageTag: string,
    title: string,
    manifestAbsPath: string
  }[]> {
    const subtitleManifests: { iso639_2LanguageTag: string, title: string, manifestAbsPath: string }[] = [];

    for (const stream of videoAnalysis.streams) {
      if (stream.codecType !== 'subtitle') {
        continue;
      }
      if (!this.isSupportedTextBasedSubtitleStream(stream)) {
        console.warn('Skipping non-text-based subtitle stream:', stream);
        continue;
      }

      let iso639_2LanguageTag = (stream.tags.language || 'und').toLowerCase();
      if (!/[a-z]{3}/i.test(iso639_2LanguageTag)) {
        iso639_2LanguageTag = 'und';
      }

      const streamTitle = (stream.tags.title ?? iso639_2LanguageTag).replace(/"/g, '');

      const vttTargetPath = Path.join(this.publicDir, 'apollo_subs', (iso639_2LanguageTag in ISO639_2ToISO639_1Mapping ? ISO639_2ToISO639_1Mapping[iso639_2LanguageTag] : iso639_2LanguageTag), `${stream.index}.vtt`);
      const ffmpegArgs = [
        '-bitexact',
        '-n',

        '-i', this.videoFile,

        '-map', `0:${stream.index}`,

        '-c:s', 'webvtt',

        '-f', 'webvtt',
        vttTargetPath
      ];

      await Fs.promises.mkdir(Path.dirname(vttTargetPath), {recursive: true});
      await new ProcessBuilder('ffmpeg', ffmpegArgs)
        .errorOnNonZeroExit()
        .withCwd(this.publicDir)
        .runPromised();

      const vttTargetContent = await Fs.promises.readFile(vttTargetPath, 'utf-8');
      const vttTargetContentLines = vttTargetContent.split(/\r?\n/);
      vttTargetContentLines.splice(1, 0, `X-TIMESTAMP-MAP=MPEGTS:${firstFramePts},LOCAL:00:00:00.000`);
      await Fs.promises.writeFile(vttTargetPath, vttTargetContentLines.join('\n'));

      const vttTargetManifestPath = Path.join(Path.dirname(vttTargetPath), `${stream.index}.m3u8`);
      await Fs.promises.writeFile(vttTargetManifestPath, `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-TARGETDURATION:${videoAnalysis.file.duration}

#EXTINF:${videoAnalysis.file.duration},
${Path.basename(vttTargetPath)}

#EXT-X-ENDLIST
`);

      subtitleManifests.push({
        iso639_2LanguageTag,
        title: streamTitle,
        manifestAbsPath: vttTargetManifestPath
      });
    }

    subtitleManifests.sort((a, b) => getFileNameCollator().compare(a.title, b.title));
    return subtitleManifests;
  }

  private isSupportedTextBasedSubtitleStream(stream: Stream): stream is SubtitleStream {
    return stream.codecType === 'subtitle' && supportedSubtitleCodecsAndTheirExtension[stream.codecName] != null;
  }

  private async extractPtsOfFirstFrame(videoFile: string): Promise<number> {
    if (!Path.isAbsolute(videoFile)) {
      throw new Error('videoFile must be an absolute path');
    }

    const ffprobeArgs = [
      '-read_intervals', '%+#1',
      '-select_streams', 'v:0',
      '-show_frames',
      '-print_format', 'json=c=1',
      videoFile];
    const ffprobeProcess = await new ProcessBuilder('ffprobe', ffprobeArgs)
      .errorOnNonZeroExit()
      .bufferStdOut()
      .bufferStdErr()
      .withCwd(this.publicDir)
      .runPromised();
    if (ffprobeProcess.err) {
      throw ffprobeProcess.err;
    }

    const bufferedStdOutString = ffprobeProcess.process.bufferedStdOut.toString('utf-8');
    let probeJson;
    try {
      probeJson = JSON.parse(bufferedStdOutString);
    } catch (err) {
      console.error('ffprobe exit code:', ffprobeProcess.code);
      console.error('ffprobe stdOut:', bufferedStdOutString);
      console.error('ffprobe stdErr:', ffprobeProcess.process.bufferedStdErr.toString('utf-8'));
      throw err;
    }

    const firstFrame = probeJson.frames[0];
    if (!firstFrame) {
      throw new Error('ffprobe did not return any frames');
    }

    const pts = firstFrame.pts ?? firstFrame.pkt_pts;
    if (typeof pts != 'number') {
      throw new Error(`ffprobe did not return a pts: ${JSON.stringify(firstFrame)}`);
    }
    return pts;
  }
}
