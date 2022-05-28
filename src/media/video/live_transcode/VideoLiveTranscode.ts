import { StringUtils } from '@spraxdev/node-commons';
import ChildProcess from 'child_process';
import Fs from 'fs';
import Path from 'path';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';
import { AudioStream, Stream, VideoStream } from '../analyser/VideoAnalyser.Types';

export default class VideoLiveTranscode {
  static async startLiveHlsTranscode(user: AbstractUser, file: IUserFile, streams: Stream[]): Promise<{ publicDir: string, manifestFileName: string, manifestMimeType: string }> {
    const {inputFilePathForFfmpeg, cwd, inputFileIsLink, publicOutputDir} = await this.prepareLiveTranscode(user, file);

    const manifestFileName = 'master.m3u8';
    const ffmpegArgs = this.generateFfmpegHlsArguments(inputFilePathForFfmpeg, streams, manifestFileName);

    return this.startLiveTranscodeProcess(ffmpegArgs, cwd, inputFileIsLink, inputFilePathForFfmpeg, publicOutputDir, manifestFileName, 'application/x-mpegURL');
  }

  static async startLiveDashTranscode(user: AbstractUser, file: IUserFile, streams: Stream[]): Promise<{ publicDir: string, manifestFileName: string }> {
    const {inputFilePathForFfmpeg, cwd, inputFileIsLink, publicOutputDir} = await this.prepareLiveTranscode(user, file);
    const manifestFileName = 'manifest.mpd';

    const ffmpegArgs = this.generateFfmpegDashArguments(inputFilePathForFfmpeg, streams, `public/${manifestFileName}`);
    return this.startLiveTranscodeProcess(ffmpegArgs, cwd, inputFileIsLink, inputFilePathForFfmpeg, publicOutputDir, manifestFileName, 'application/dash+xml');
  }

  private static async prepareLiveTranscode(user: AbstractUser, file: IUserFile): Promise<{ inputFilePathForFfmpeg: string, cwd: string, inputFileIsLink: boolean, publicOutputDir: string }> {
    const inputFileAbsolutePath = file.getAbsolutePathOnHost();
    if (inputFileAbsolutePath == null) {
      throw new Error('File does not exist on host file system');
    }

    const tmpDir = await user.getTmpFileSystem().createTmpDir('live_transcode-');
    const cwd = tmpDir.getAbsolutePathOnHost();
    if (cwd == null) {
      throw new Error('cwd is null');
    }

    const publicOutputDir = Path.join(cwd, 'public');
    await Fs.promises.mkdir(publicOutputDir, {recursive: true});

    let inputFileIsLink = false;
    let inputFilePathForFfmpeg = `input${Path.extname(file.getName())}`;

    try {
      await Fs.promises.link(inputFileAbsolutePath, Path.join(cwd, inputFilePathForFfmpeg));
      inputFileIsLink = true;
    } catch (err) {
      console.error(`Failed creating hardlink from '${inputFileAbsolutePath}' to '${Path.join(cwd, inputFilePathForFfmpeg)}', falling back to absolute path: ${err}`);

      inputFilePathForFfmpeg = inputFileAbsolutePath;
    }

    return {
      inputFilePathForFfmpeg,
      cwd,
      inputFileIsLink,
      publicOutputDir
    };
  }

  private static async startLiveTranscodeProcess(ffmpegArgs: string[], cwd: string, inputFileIsLink: boolean, inputFilePathForFfmpeg: string, publicDir: string, manifestFileName: string, manifestMimeType: string): Promise<{ publicDir: string, manifestFileName: string, manifestMimeType: string }> {
    return new Promise((resolve, reject) => {
      const ffmpegProcess = ChildProcess.spawn('ffmpeg', ffmpegArgs, {cwd});
      ffmpegProcess.on('error', (err) => {
        if (inputFileIsLink) {
          Fs.unlinkSync(Path.join(cwd, inputFilePathForFfmpeg));
        }

        reject(err);
      });

      ffmpegProcess.stdout.on('data', (data) => {
        console.log(`[OUT] ${data}`);
      });

      let alreadyResolved = false;
      ffmpegProcess.stderr.on('data', async (data) => {
        console.log(`[ERR] ${data}`);

        if (alreadyResolved) {
          return;
        }

        const manifestAbsolutePath = Path.join(publicDir, manifestFileName);
        if (!Fs.existsSync(manifestAbsolutePath) || Fs.statSync(manifestAbsolutePath).size <= 1) {
          return;
        }

        alreadyResolved = true;
        return resolve({
          publicDir,

          manifestFileName,
          manifestMimeType
        });
      });

      ffmpegProcess.on('exit', (code) => {
        console.log(`ffmpeg process exited with code ${code}`);

        if (inputFileIsLink) {
          Fs.unlinkSync(Path.join(cwd, inputFilePathForFfmpeg));
        }

        if (!alreadyResolved) {
          alreadyResolved = true;
          reject(new Error(`ffmpeg process exited with code ${code}`));
        }
      });
    });
  }

  private static generateFfmpegHlsArguments(inputFilePath: string, streams: Stream[], outputMasterFileName: string): string[] {
    const result = [
      '-bitexact',
      '-n', // Do not overwrite if file already exists and fail instead

      '-i', inputFilePath,

      '-map_chapters', '0', // Copy existing chapters from input file
      '-map_metadata', '0', // Copy existing metadata from input file

      /* Use NVENC hardware acceleration for encoding with some sane high quality settings */
      '-c:v', 'h264_nvenc',
      '-preset', 'p6',
      '-profile', 'high',
      '-tune', 'hq',
      '-rc-lookahead', '8',
      '-bf', '2',
      '-rc', 'vbr',
      '-cq', '26'
    ];

    const audioGroupName = 'audio';
    const varStreamMap = [];
    const outputStreamCounter = {video: 0, audio: 0};

    let outputStreamIndexCounter = 0;
    const subtitleStreams = streams.filter(stream => stream.codecType == 'subtitle');
    const hasSubtitleStream = subtitleStreams.length > 0;
    for (const stream of streams) {
      if (stream.codecType == 'video') {
        const videoStream = stream as VideoStream;

        let avgSourceFps = 30;
        if (StringUtils.isNumeric(videoStream.avgFrameRate)) {
          avgSourceFps = parseInt(videoStream.avgFrameRate, 10);
        } else if (videoStream.avgFrameRate.includes('/')) {
          const [num, den] = videoStream.avgFrameRate.split('/');
          avgSourceFps = parseInt(num, 10) / parseInt(den, 10);
        }

        let targetWidth = 1920;

        if (targetWidth > videoStream.width) {
          targetWidth = videoStream.width;
        }

        let currentVideoStream = `0:${videoStream.index}`;
        const videoFilters = [];

        if (hasSubtitleStream) {
          let videoStreamCounter = 0;
          for (const subtitleStream of subtitleStreams) {
            if (['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle'].includes(subtitleStream.codecName)) {
              if (currentVideoStream.indexOf('[') === -1) {
                currentVideoStream = `[${currentVideoStream}]`;
              }

              videoFilters.push(`${currentVideoStream}[0:${subtitleStream.index}]overlay${currentVideoStream = `[v${videoStreamCounter++}]`}`);
            } else {
              videoFilters.push(`subtitles=filename='${inputFilePath}'`/* + ':stream_index=' */);
            }
          }
        }
        if (videoStream.width != targetWidth) {
          videoFilters.push(`scale=${targetWidth}:-1`);
        }

        const TARGET_FPS = avgSourceFps >= 60 ? 60 : Math.min(avgSourceFps, 30);
        const GROUP_OF_PICTURES_SIZE = Math.round(TARGET_FPS * 2);

        ++outputStreamIndexCounter;
        result.push(
            '-map', `${currentVideoStream}`,

            '-flags', '+cgop',
            `-g`, GROUP_OF_PICTURES_SIZE.toString(),
            `-sc_threshold`, '0',
            // `-r`, TARGET_FPS.toString(),
            `-pix_fmt`, 'yuv420p',

            `-b:v`, '0',
            `-maxrate`, '120M',
            `-bufsize`, '240M'
        );

        if (videoFilters.length > 0) {
          result.push(`-filter_complex`, videoFilters.join(','));
        }

        varStreamMap.push(`v:${outputStreamCounter.video++},agroup:${audioGroupName},name:video`);
      } else if (stream.codecType == 'audio') {
        const audioStream = stream as AudioStream;

        const targetChannelCount = Math.min(audioStream.channels, 2);
        const targetSampleRate = StringUtils.isNumeric(audioStream.sampleRate) ? Math.min(parseInt(audioStream.sampleRate, 10), 48000) : 48000;

        ++outputStreamIndexCounter;
        result.push(
            '-map', `0:${audioStream.index}`,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', targetChannelCount.toString(),
            '-ar', targetSampleRate.toString()
        );

        // ISO 639-2 language code (https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes)
        varStreamMap.push(`a:${outputStreamCounter.audio++},agroup:${audioGroupName},name:${audioStream.tags.language ?? 'und'},language:${audioStream.tags.language ?? 'und'},default:${outputStreamCounter.audio == 1 ? 'yes' : 'no'}`);
      }
    }

    // TODO: Add silent audio stream if no audio stream is present
    // TODO: add text subtitle streams instead of hard-subbing or make configurable

    result.push(
        '-hls_list_size', '0',
        '-hls_time', '2',
        '-hls_init_time', '2',
        '-hls_allow_cache', '1',
        '-hls_segment_filename', 'public/stream_%v/chunk_%d.ts',
        '-hls_enc', '0',
        '-hls_segment_type', 'mpegts',
        '-hls_playlist_type', 'event',
        '-master_pl_name', outputMasterFileName,
        // '-master_pl_publish_rate', '1',
        '-hls_flags', 'independent_segments',
        '-var_stream_map', varStreamMap.join(' '),
        // '-use_timeline', '1',
        // '-streaming', '1',
        // '-update_period', '1',
        // '-adaptation_sets', adaptionSets.trimStart(),

        '-f', 'hls',
        `public/stream_%v/manifest.m3u8`
    );

    return result;
  }

  private static generateFfmpegDashArguments(inputFilePath: string, streams: Stream[], outputManifestPath: string): string[] {
    const result = [
      '-bitexact',
      '-n', // Do not overwrite if file already exists and fail instead

      '-i', inputFilePath,

      '-map_chapters', '0', // Copy existing chapters from input file
      '-map_metadata', '0', // Copy existing metadata from input file

      /* Use NVENC hardware acceleration for encoding with some sane high quality settings */
      '-c:v', 'h264_nvenc',
      '-preset', 'p6',
      '-profile', 'high',
      '-tune', 'hq',
      '-rc-lookahead', '8',
      '-bf', '2',
      '-rc', 'vbr',
      '-cq', '26'
    ];

    let outputStreamIndexCounter = 0;
    const subtitleStream = streams.find(stream => stream.codecType == 'subtitle');
    const hasSubtitleStream = subtitleStream != null;
    for (const stream of streams) {
      if (stream.codecType == 'video') {
        const videoStream = stream as VideoStream;

        let avgSourceFps = 30;
        if (StringUtils.isNumeric(videoStream.avgFrameRate)) {
          avgSourceFps = parseInt(videoStream.avgFrameRate, 10);
        } else if (videoStream.avgFrameRate.includes('/')) {
          const [num, den] = videoStream.avgFrameRate.split('/');
          avgSourceFps = parseInt(num, 10) / parseInt(den, 10);
        }

        let targetWidth = 1920;

        if (targetWidth > videoStream.width) {
          targetWidth = videoStream.width;
        }

        const videoFilters = [];

        if (hasSubtitleStream) {
          if (['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle'].includes(subtitleStream.codecName)) {
            videoFilters.push(`[0:v:${videoStream.index}][0:s]overlay`);
          } else {
            videoFilters.push(`subtitles=filename='${inputFilePath}'`/* + ':stream_index=' */);
          }
        }
        if (videoStream.width != targetWidth) {
          videoFilters.push(`scale=${targetWidth}:-1`);
        }

        const TARGET_FPS = avgSourceFps >= 60 ? 60 : Math.min(avgSourceFps, 30);
        const GROUP_OF_PICTURES_SIZE = Math.round(TARGET_FPS * 2);

        ++outputStreamIndexCounter;
        result.push(
            '-map', `0:${videoStream.index}`,

            `-keyint_min`, GROUP_OF_PICTURES_SIZE.toString(),
            `-g`, GROUP_OF_PICTURES_SIZE.toString(),
            `-sc_threshold`, '0',
            `-r`, TARGET_FPS.toString(),
            `-pix_fmt`, 'yuv420p',

            `-b:v`, '0',
            `-maxrate`, '120M',
            `-bufsize`, '240M'
        );

        if (videoFilters.length > 0) {
          result.push(`-filter_complex`, videoFilters.join(','));
        }
      } else if (stream.codecType == 'audio') {
        const audioStream = stream as AudioStream;

        const targetChannelCount = Math.min(audioStream.channels, 2);
        const targetSampleRate = StringUtils.isNumeric(audioStream.sampleRate) ? Math.min(parseInt(audioStream.sampleRate, 10), 48000) : 48000;

        // FIXME: video player does not support multiple same language streams and only shows first
        ++outputStreamIndexCounter;
        result.push(
            '-map', `0:${audioStream.index}`,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', targetChannelCount.toString(),
            '-ar', targetSampleRate.toString(),

            // ISO 639-2 language code (https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes)
            '-metadata', `language=${audioStream.tags.language ?? 'und'}`
        );
      }
    }

    // TODO: Add silent audio stream if no audio stream is present
    // TODO: add text subtitle streams instead of hard-subbing or make configurable

    let adaptionSets = '';
    for (let i = 0; i < outputStreamIndexCounter; ++i) {
      adaptionSets += ` id=${i},streams=${i}`;
    }

    result.push(
        '-init_seg_name', 'init_$RepresentationID$',
        '-media_seg_name', 'chunk_$RepresentationID$_$Number$',
        '-use_template', '1',
        '-use_timeline', '1',
        '-seg_duration', '2',
        '-streaming', '1',
        '-update_period', '1',
        '-dash_segment_type', 'mp4',
        '-utc_timing_url', 'https://time.akamai.com/?iso', // default url is http
        '-adaptation_sets', adaptionSets.trimStart(),

        '-f', 'dash',
        outputManifestPath
    );

    return result;
  }
}
