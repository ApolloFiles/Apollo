import { SOFTWARE } from '#src/plugins/official/ffmpeg/accel/Accel.js';
import { createFfmpegDevice } from '#src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import HwContext from '#src/plugins/official/ffmpeg/accel/HwContext.js';
import AudioStreamArgumentsBuilder from '#src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/AudioStreamArgumentsBuilder.js';
import StreamArgumentsBuilder from '#src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/StreamArgumentsBuilder.js';
import LiveTranscodeLauncher from '#src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import type { AudioStream, VideoStream } from '#src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';

function videoStream(avgFrameRate: string): VideoStream {
  return { avgFrameRate } as unknown as VideoStream;
}

function inputPositions(args: string[]): number[] {
  return args.flatMap((arg, index) => arg === '-i' ? [index] : []);
}

describe(LiveTranscodeLauncher, () => {
  describe(LiveTranscodeLauncher.determineTargetFrameRate, () => {
    test.for([
      { avgFrameRate: '24000/1001', fps: 24000 / 1001 },
      { avgFrameRate: '25', fps: 25 },
      { avgFrameRate: '60/1', fps: 60 },
    ])('Keeps the film frame rate $avgFrameRate as it is, without forcing it to 30', ({ avgFrameRate, fps }) => {
      expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream(avgFrameRate))).toEqual({ fps, capFrameRate: false });
    });

    test('Brings high frame rates down to 60', () => {
      expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('144/1'))).toEqual({ fps: 60, capFrameRate: true });
    });

    test.for([
      { avgFrameRate: '1000/1' },
      { avgFrameRate: '90000/1' },
    ])('Does not let the damaged frame rate $avgFrameRate dictate the GOP', ({ avgFrameRate }) => {
      expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream(avgFrameRate))).toEqual({ fps: 60, capFrameRate: true });
    });

    test.for([
      { avgFrameRate: '0/0' },
      { avgFrameRate: '0' },
      { avgFrameRate: 'abc' },
      { avgFrameRate: '' },
      { avgFrameRate: '25/0' },
    ])("Falls back to 30 fps for '$avgFrameRate'", ({ avgFrameRate }) => {
      expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream(avgFrameRate))).toEqual({ fps: 30, capFrameRate: false });
    });
  });

  describe(LiveTranscodeLauncher.buildArgs, () => {
    const target = { fps: 25, capFrameRate: false, width: 1920, segmentDuration: 2 };

    test('Reads the whole transcode from one demuxer without a burned-in subtitle', () => {
      const args = LiveTranscodeLauncher.buildArgs(SOFTWARE, '/media/in.mkv', 30, ['-map', '0:0'], ['v:0,agroup:audio,name:video'], target, null);

      expect(inputPositions(args)).toHaveLength(1);
      expect(args).not.toContain('null');
      expect(args).toContain('-shortest');
    });

    test('Gives every audio track a demuxer of its own with a burned-in subtitle', () => {
      const videoStream = { index: 0, codecType: 'video', codecName: 'h264', width: 1920, height: 1080, avgFrameRate: '25/1' } as unknown as VideoStream;
      const audioStream = (index: number) => ({ index, codecType: 'audio', codecName: 'dts', channels: 6, tags: {} } as unknown as AudioStream);
      const streamArgs = new StreamArgumentsBuilder(new AudioStreamArgumentsBuilder()).build([videoStream, audioStream(1), audioStream(2)], ['-map', '[vout]'], true);

      const args = LiveTranscodeLauncher.buildArgs(SOFTWARE, '/media/in.mkv', 0, streamArgs.args, streamArgs.varStreamMap, target, { videoStreamIndex: 0, audioStreamCount: 2 });

      expect(inputPositions(args)).toHaveLength(4);
      expect(args.slice(args.indexOf('-map', args.indexOf('[vout]')))).toEqual(expect.arrayContaining(['2:1', '3:2']));
      expect(args).not.toContain('2:2');
    });

    test('Gives subtitle, video and audio their own demuxer with a burned-in subtitle; the first one copies the video into the void', () => {
      const args = LiveTranscodeLauncher.buildArgs(SOFTWARE, '/media/in.mkv', 30, ['-map', '[vout]'], ['v:0,agroup:audio,name:video'], target, { videoStreamIndex: 2, audioStreamCount: 1 });

      expect(args.slice(0, args.lastIndexOf('-i') + 2)).toEqual(['-bitexact', '-n', '-ss', '30', '-i', '/media/in.mkv', '-ss', '30', '-i', '/media/in.mkv', '-ss', '30', '-i', '/media/in.mkv']);
      expect(args.slice(-7)).toEqual(['-map', '0:2', '-c', 'copy', '-f', 'null', '-']);
      expect(args.indexOf('stream_%v/manifest.m3u8')).toBeLessThan(args.length - 7);
      expect(args).not.toContain('-shortest');
    });

    test('Puts the device options in front of the video input only', () => {
      const accel = new HwContext(createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel'), 'fullChain', 8);

      const args = LiveTranscodeLauncher.buildArgs(accel, '/media/in.mkv', 0, ['-map', '[vout]'], ['v:0,agroup:audio,name:video'], target, { videoStreamIndex: 0, audioStreamCount: 1 });

      const inputs = inputPositions(args);
      const [subtitleInput, videoInput, audioInput] = inputs;
      expect(inputs).toHaveLength(3);
      expect(args.slice(0, subtitleInput)).not.toContain('-hwaccel');
      expect(args.slice(subtitleInput, videoInput)).toContain('-hwaccel');
      expect(args.slice(videoInput, audioInput)).not.toContain('-hwaccel');
    });
  });
});
