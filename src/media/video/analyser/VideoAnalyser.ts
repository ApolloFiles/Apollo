import ChildProcess from 'child_process';
import * as type from './VideoAnalyser.Types';

export default class VideoAnalyser {
  static async analyze(absolutePath: string, extendedAnalysis: true): Promise<type.ExtendedVideoAnalysis>;
  static async analyze(absolutePath: string, extendedAnalysis?: false): Promise<type.VideoFileAnalysis>;
  static async analyze(absolutePath: string, extendedAnalysis: boolean = false): Promise<type.VideoFileAnalysis | type.ExtendedVideoAnalysis> {
    return new Promise((resolve, reject): void => {
      const processArgs = ['-print_format', 'json=compact=1', '-show_format'];
      if (extendedAnalysis) {
        processArgs.push('-show_streams', '-show_chapters');
      }
      processArgs.push(absolutePath);

      const process = ChildProcess.spawn('ffprobe', processArgs);

      process.on('error', (err) => {
        reject(err);
      });

      let probeJsonString = '';
      process.stdout.on('data', (data) => {
        probeJsonString += data;
      });

      process.on('exit', (code) => {
        console.log(`ffprobe child process exited with code ${code}`);

        if (code !== 0) {
          return reject(new Error(`ffprobe exited with code ${code}`));
        }

        const probeJson = JSON.parse(probeJsonString);
        const fileAnalysis = this.extractFileAnalysis(probeJson);

        if (!extendedAnalysis) {
          return resolve(fileAnalysis);
        }

        const chapters: type.VideoChapterAnalysis['chapters'] = [];
        if (probeJson.chapters) {
          for (const chapter of probeJson.chapters) {
            chapters.push({
              id: chapter.id,

              timeBase: chapter.time_base,

              start: chapter.start,
              startTime: chapter.start_time,

              end: chapter.end,
              endTime: chapter.end_time,

              tags: chapter.tags ?? {}
            });
          }
        }

        const analyzedStreams: type.VideoStreamAnalysis['streams'] = [];
        for (const stream of probeJson.streams) {
          const baseStream = this.extractBaseStream(stream);

          switch (baseStream.codecType) {
            case 'video':
              analyzedStreams.push(this.extractVideoStream(baseStream, stream));
              break;
            case 'audio':
              analyzedStreams.push(this.extractAudioStream(baseStream, stream));
              break;

            default:
              analyzedStreams.push(baseStream);
              break;
          }
        }

        return resolve({...fileAnalysis, chapters, streams: analyzedStreams});
      });
    });
  }

  private static extractFileAnalysis(rawProbeResult: any): type.VideoFileAnalysis {
    return {
      file: {
        fileName: rawProbeResult.format.filename,

        streamCount: rawProbeResult.format.nb_streams,
        programCount: rawProbeResult.format.nb_programs,

        formatName: rawProbeResult.format.format_name,
        formatNameLong: rawProbeResult.format.format_long_name,

        startTime: rawProbeResult.format.start_time,
        duration: rawProbeResult.format.duration,

        size: rawProbeResult.format.size,
        bitRate: rawProbeResult.format.bit_rate,
        probeScore: rawProbeResult.format.probe_score,

        tags: rawProbeResult.format.tags ?? {}
      }
    };
  }

  private static extractBaseStream(rawStream: any): type.Stream {
    return {
      index: rawStream.index,

      codecType: rawStream.codec_type,
      codecName: rawStream.codec_name,
      codecNameLong: rawStream.codec_long_name,
      codecTagString: rawStream.codec_tag_string,
      codecTag: rawStream.codec_tag,

      rFrameRate: rawStream.r_frame_rate,
      avgFrameRate: rawStream.avg_frame_rate,

      timeBase: rawStream.time_base,
      startPts: rawStream.start_pts,
      startTime: rawStream.start_time,
      durationTs: rawStream.duration_ts ?? undefined,
      duration: rawStream.duration ?? undefined,

      extraDataSize: rawStream.extradata_size,

      tags: rawStream.tags ?? {}
    };
  }

  private static extractVideoStream(baseStream: type.Stream, rawStream: any): type.VideoStream {
    return {
      ...baseStream,
      codecType: 'video',

      profile: rawStream.profile,

      width: rawStream.width,
      height: rawStream.height,
      codedWidth: rawStream.coded_width,
      codedHeight: rawStream.coded_height,

      closedCaptions: rawStream.closed_captions,
      filmGrain: rawStream.film_grain,
      hasBFrames: rawStream.has_b_frames,
      sampleAspectRatio: rawStream.sample_aspect_ratio,
      displayAspectRatio: rawStream.display_aspect_ratio,
      pixFmt: rawStream.pix_fmt,
      level: rawStream.level,
      colorRange: rawStream.color_range,
      chromaLocation: rawStream.chroma_location,
      refs: rawStream.refs,

      disposition: rawStream.disposition ?? {}
    };
  }

  private static extractAudioStream(baseStream: type.Stream, rawStream: any): type.AudioStream {
    return {
      ...baseStream,
      codecType: 'audio',

      sampleFmt: rawStream.sample_fmt,
      sampleRate: rawStream.sample_rate,

      channels: rawStream.channels,
      channelLayout: rawStream.channel_layout,

      bitsPerSample: rawStream.bits_per_sample,

      disposition: rawStream.disposition ?? {}
    };
  }
}
