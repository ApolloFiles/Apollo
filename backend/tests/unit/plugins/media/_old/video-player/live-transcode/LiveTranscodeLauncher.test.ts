import { describe, expect, test } from 'vitest';
import { SOFTWARE } from '../../../../../../../src/plugins/official/ffmpeg/accel/Accel.js';
import { createFfmpegDevice } from '../../../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import HwContext from '../../../../../../../src/plugins/official/ffmpeg/accel/HwContext.js';
import AudioStreamArgumentsBuilder from '../../../../../../../src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/AudioStreamArgumentsBuilder.js';
import StreamArgumentsBuilder from '../../../../../../../src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/StreamArgumentsBuilder.js';
import LiveTranscodeLauncher from '../../../../../../../src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import type { AudioStream, VideoStream } from '../../../../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';

function videoStream(avgFrameRate: string): VideoStream {
  return { avgFrameRate } as unknown as VideoStream;
}

describe('LiveTranscodeLauncher.determineTargetFrameRate', () => {
  test('Keeps a film frame rate as it is, without forcing it to 30', () => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('24000/1001'))).toEqual({ fps: 24000 / 1001, capFrameRate: false });
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('25'))).toEqual({ fps: 25, capFrameRate: false });
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('60/1'))).toEqual({ fps: 60, capFrameRate: false });
  });

  test('Brings high frame rates down to 60', () => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('144/1'))).toEqual({ fps: 60, capFrameRate: true });
  });

  test('Does not let a damaged file dictate the GOP', () => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('1000/1'))).toEqual({ fps: 60, capFrameRate: true });
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('90000/1'))).toEqual({ fps: 60, capFrameRate: true });
  });

  test.each(['0/0', '0', 'abc', '', '25/0'])("Falls back to 30 fps for '%s'", (avgFrameRate) => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream(avgFrameRate))).toEqual({ fps: 30, capFrameRate: false });
  });
});

describe('LiveTranscodeLauncher.buildArgs', () => {
  const target = { fps: 25, capFrameRate: false, width: 1920, segmentDuration: 2 };

  test('Reads the whole transcode from one demuxer without a burned-in subtitle', () => {
    const args = LiveTranscodeLauncher.buildArgs(SOFTWARE, '/media/in.mkv', 30, ['-map', '0:0'], ['v:0,agroup:audio,name:video'], target, null);

    expect(args.filter((arg) => arg === '-i')).toHaveLength(1);
    expect(args).not.toContain('null');
    expect(args).toContain('-shortest');
  });

  test('Gives every audio track a demuxer of its own with a burned-in subtitle', () => {
    const videoStream = { index: 0, codecType: 'video', codecName: 'h264', width: 1920, height: 1080, avgFrameRate: '25/1' } as unknown as VideoStream;
    const audioStream = (index: number) => ({ index, codecType: 'audio', codecName: 'dts', channels: 6, tags: {} } as unknown as AudioStream);
    const streamArgs = new StreamArgumentsBuilder(new AudioStreamArgumentsBuilder()).build([videoStream, audioStream(1), audioStream(2)], ['-map', '[vout]'], true);

    const args = LiveTranscodeLauncher.buildArgs(SOFTWARE, '/media/in.mkv', 0, streamArgs.args, streamArgs.varStreamMap, target, { videoStreamIndex: 0, audioStreamCount: 2 });

    expect(args.filter((arg) => arg === '-i')).toHaveLength(4);
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

    const inputs = args.reduce<number[]>((indices, arg, index) => arg === '-i' ? [...indices, index] : indices, []);
    expect(inputs).toHaveLength(3);
    expect(args.slice(0, inputs[0])).not.toContain('-hwaccel');
    expect(args.slice(inputs[0], inputs[1])).toContain('-hwaccel');
    expect(args.slice(inputs[1], inputs[2])).not.toContain('-hwaccel');
  });
});
