import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { container } from 'tsyringe';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Accel } from '../../../../src/plugins/official/ffmpeg/accel/Accel.js';
import { SOFTWARE } from '../../../../src/plugins/official/ffmpeg/accel/Accel.js';
import { createFfmpegDevice } from '../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import type FfmpegCapabilityCache from '../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilityCache.js';
import HwContext from '../../../../src/plugins/official/ffmpeg/accel/HwContext.js';
import PixelFormatUtil from '../../../../src/plugins/official/ffmpeg/accel/PixelFormatUtil.js';
import type FfmpegCandidatePlanner from '../../../../src/plugins/official/ffmpeg/job/FfmpegCandidatePlanner.js';
import FfmpegJobRunner from '../../../../src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import FfmpegJobStats, { type FfmpegAttemptRecord } from '../../../../src/plugins/official/ffmpeg/job/FfmpegJobStats.js';
import FfmpegProcessRunner from '../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import type { AudioStream, SubtitleStream, VideoStream } from '../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';
import AudioStreamArgumentsBuilder from '../../../../src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/AudioStreamArgumentsBuilder.js';
import { BURN_IN_INPUT } from '../../../../src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/BurnInInputs.js';
import StreamArgumentsBuilder from '../../../../src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/StreamArgumentsBuilder.js';
import VideoStreamArgumentsBuilder from '../../../../src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/VideoStreamArgumentsBuilder.js';
import LiveTranscodeLauncher from '../../../../src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import SeekThumbnailGenerator from '../../../../src/plugins/official/media/_old/video-player/seek-thumbnails/generator/SeekThumbnailGenerator.js';
import VideoThumbnailFrameExtractor from '../../../../src/plugins/official/media/library/thumbnail/VideoThumbnailFrameExtractor.js';
import { ffmpegEnvironment, type FfmpegTestDevice, type FfmpegTestSample, requireFfmpeg, requireSample } from './FfmpegTestEnvironment.js';

/**
 * The commands Apollo's jobs really build, run on the hardware this machine really has.
 *
 * The regression this guards against: a device the probe accepted but that makes FFmpeg die without writing any
 * output, which used to surface as a missing thumbnail or a live transcode that never starts.
 */

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-ffmpeg-devices-'));
});

afterAll(async () => {
  await Fs.promises.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

async function runToCompletion(args: string[], cwd: string): Promise<void> {
  await Fs.promises.mkdir(cwd, { recursive: true });
  const handle = container.resolve(FfmpegProcessRunner).spawn(args, { cwd, timeoutInMillis: 60_000 });

  const exitResult = await handle.waitForExit();
  expect(exitResult.exitCode, `${args.join(' ')}\n${handle.getLogProblems()}`).toBe(0);
}

async function countFiles(directory: string, prefix: string): Promise<number> {
  return (await Fs.promises.readdir(directory)).filter((fileName) => fileName.startsWith(prefix)).length;
}

function toVideoInput(sample: FfmpegTestSample) {
  return { path: sample.path, codecName: sample.codecName, pixelFormat: sample.pixelFormat, width: sample.width, height: sample.height };
}

function toVideoStream(sample: FfmpegTestSample): VideoStream {
  return { index: 0, codecType: 'video', codecName: sample.codecName, pixFmt: sample.pixelFormat, width: sample.width, height: sample.height, avgFrameRate: '25/1' } as unknown as VideoStream;
}

function transcodeArgs(accel: Accel, sample: FfmpegTestSample, outputFile: string): string[] {
  const videoArgs = new VideoStreamArgumentsBuilder().build(accel, toVideoStream(sample), null, { fps: 25, capFrameRate: false, width: 320, segmentDuration: 2 });
  return [...accel.inputArgs(), '-i', sample.path, '-t', '1', '-an', ...videoArgs, '-f', 'mp4', '-y', outputFile];
}

const AUDIO_STREAM = { index: 1, codecType: 'audio', codecName: 'aac', channels: 1, tags: {} } as unknown as AudioStream;
const PGS_STREAM = { index: 2, codecType: 'subtitle', codecName: 'hdmv_pgs_subtitle' } as unknown as SubtitleStream;
const LIVE_TRANSCODE_TARGET = { fps: 25, capFrameRate: false, width: 640, segmentDuration: 2 };
const DOWNSCALED_LIVE_TRANSCODE_TARGET = { ...LIVE_TRANSCODE_TARGET, width: 320 };

/** Video, audio and the burned-in subtitle, as the launcher assembles them */
function liveTranscodeWithBurnInArgs(accel: Accel, sample: FfmpegTestSample, target = LIVE_TRANSCODE_TARGET): string[] {
  const videoStream = toVideoStream(sample);
  const videoArgs = new VideoStreamArgumentsBuilder().build(accel, videoStream, PGS_STREAM, target);
  const streamArgs = new StreamArgumentsBuilder(new AudioStreamArgumentsBuilder()).build([videoStream, AUDIO_STREAM], videoArgs, true);
  return LiveTranscodeLauncher.buildArgs(accel, sample.path, 0, streamArgs.args, streamArgs.varStreamMap, target, { videoStreamIndex: videoStream.index, audioStreamCount: 1 });
}

/** Mean luma (0–255) of the frame at `seconds` in whatever ffmpeg can open at `input` */
async function meanLumaAt(input: string, seconds: number, cwd: string): Promise<number> {
  const framePath = Path.join(cwd, `luma-${seconds}.gray`);
  await runToCompletion(['-ss', seconds.toString(), '-i', input, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-y', framePath], cwd);

  const pixels = await Fs.promises.readFile(framePath);
  return pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
}

/** The subtitle paints the whole frame white from 1s to 3s; the test pattern underneath never gets anywhere near that */
async function expectSubtitleBurnedIn(cwd: string): Promise<void> {
  const manifest = Path.join(cwd, 'stream_video', 'manifest.m3u8');
  expect(await meanLumaAt(manifest, 0.5, cwd)).toBeLessThan(180);
  expect(await meanLumaAt(manifest, 2, cwd)).toBeGreaterThan(220);
}

function fullChain(device: FfmpegTestDevice, sample: FfmpegTestSample): HwContext {
  return new HwContext(device, 'fullChain', PixelFormatUtil.determineBitDepth(sample.pixelFormat));
}

function requireDecoding(ctx: Parameters<typeof requireSample>[0], device: FfmpegTestDevice, sample: FfmpegTestSample | null, description: string, canDecode: boolean | null): FfmpegTestSample {
  const requiredSample = requireSample(ctx, sample, description);
  if (canDecode !== true) {
    ctx.skip(`'${device.id}' cannot decode ${description}`);
  }
  return requiredSample;
}

describe('In software', () => {
  test('Generates seek thumbnails', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().h264Sample, 'an h264 sample');
    const cwd = Path.join(tmpDir, 'software-seek');

    await runToCompletion(SeekThumbnailGenerator.buildArgs(SOFTWARE,toVideoInput(sample)), cwd);

    expect(await countFiles(cwd, 'keyframes_')).toBeGreaterThan(0);
  });

  test('Extracts poster candidates', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().h264Sample, 'an h264 sample');
    const cwd = Path.join(tmpDir, 'software-poster');

    await runToCompletion(VideoThumbnailFrameExtractor.buildArgs(SOFTWARE,toVideoInput(sample), 0), cwd);

    expect(await countFiles(cwd, 'frame_')).toBeGreaterThan(0);
  });

  test('Transcodes to h264', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().h264Sample, 'an h264 sample');
    const outputFile = Path.join(tmpDir, 'software-transcode.mp4');

    await runToCompletion(transcodeArgs(SOFTWARE,sample, outputFile), tmpDir);

    expect((await Fs.promises.stat(outputFile)).size).toBeGreaterThan(0);
  });

  test('Transcodes 10-bit HEVC to 8-bit h264', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().hevc10Sample, 'a 10-bit HEVC sample');
    const outputFile = Path.join(tmpDir, 'software-transcode-10bit.mp4');

    await runToCompletion(transcodeArgs(SOFTWARE,sample, outputFile), tmpDir);

    expect((await Fs.promises.stat(outputFile)).size).toBeGreaterThan(0);
  });

  test('Burns a bitmap subtitle into a live transcode', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().pgsSample, 'a sample with a PGS subtitle');
    const cwd = Path.join(tmpDir, 'software-burn-in');

    await runToCompletion(liveTranscodeWithBurnInArgs(SOFTWARE,sample), cwd);

    await expectSubtitleBurnedIn(cwd);
  });

  test('Burns in a subtitle whose canvas does not share the video size', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().pgsMismatchedCanvasSample, 'a sample with a mismatched PGS canvas');
    const cwd = Path.join(tmpDir, 'software-burn-in-mismatched-canvas');

    await runToCompletion(liveTranscodeWithBurnInArgs(SOFTWARE, sample), cwd);

    await expectSubtitleBurnedIn(cwd);
  });

  test('Keeps a burned-in subtitle in the frame when the video is scaled down', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().pgsSample, 'a sample with a PGS subtitle');
    const cwd = Path.join(tmpDir, 'software-burn-in-scaled');

    await runToCompletion(liveTranscodeWithBurnInArgs(SOFTWARE,sample, DOWNSCALED_LIVE_TRANSCODE_TARGET), cwd);

    await expectSubtitleBurnedIn(cwd);
  });
});

describe.each(ffmpegEnvironment().devices.map((device) => [device.id, device] as const))('On %s', (_, device) => {
  const safeName = device.id.replace(/[^a-z0-9]/gi, '_');

  test('Generates seek thumbnails with frames on the device', async (ctx) => {
    const sample = requireDecoding(ctx, device, ffmpegEnvironment().h264Sample, 'h264', device.canDecodeH264);
    const cwd = Path.join(tmpDir, `${safeName}-seek`);

    await runToCompletion(SeekThumbnailGenerator.buildArgs(fullChain(device, sample), toVideoInput(sample)), cwd);

    expect(await countFiles(cwd, 'keyframes_')).toBeGreaterThan(0);
  });

  test('Extracts poster candidates with frames on the device', async (ctx) => {
    const sample = requireDecoding(ctx, device, ffmpegEnvironment().h264Sample, 'h264', device.canDecodeH264);
    const cwd = Path.join(tmpDir, `${safeName}-poster`);

    await runToCompletion(VideoThumbnailFrameExtractor.buildArgs(fullChain(device, sample), toVideoInput(sample), 0), cwd);

    expect(await countFiles(cwd, 'frame_')).toBeGreaterThan(0);
  });

  test('Transcodes h264 entirely on the device', async (ctx) => {
    const sample = requireDecoding(ctx, device, ffmpegEnvironment().h264Sample, 'h264', device.canDecodeH264);
    if (!device.canEncodeH264) {
      ctx.skip(`'${device.id}' cannot encode h264`);
    }
    const outputFile = Path.join(tmpDir, `${safeName}-transcode.mp4`);

    await runToCompletion(transcodeArgs(fullChain(device, sample), sample, outputFile), tmpDir);

    expect((await Fs.promises.stat(outputFile)).size).toBeGreaterThan(0);
  });

  test('Transcodes 10-bit HEVC to 8-bit h264 entirely on the device', async (ctx) => {
    const sample = requireDecoding(ctx, device, ffmpegEnvironment().hevc10Sample, '10-bit HEVC', device.canDecodeHevc10);
    if (!device.canEncodeH264) {
      ctx.skip(`'${device.id}' cannot encode h264`);
    }
    const outputFile = Path.join(tmpDir, `${safeName}-transcode-10bit.mp4`);

    await runToCompletion(transcodeArgs(fullChain(device, sample), sample, outputFile), tmpDir);

    expect((await Fs.promises.stat(outputFile)).size).toBeGreaterThan(0);
  });

  test('Burns a bitmap subtitle into a live transcode entirely on the device', async (ctx) => {
    const sample = requireDecoding(ctx, device, ffmpegEnvironment().pgsSample, 'h264', device.canDecodeH264);
    if (!device.canEncodeH264) {
      ctx.skip(`'${device.id}' cannot encode h264`);
    }
    const cwd = Path.join(tmpDir, `${safeName}-burn-in`);

    await runToCompletion(liveTranscodeWithBurnInArgs(fullChain(device, sample), sample), cwd);

    await expectSubtitleBurnedIn(cwd);
  });

  test('Keeps a burned-in subtitle in the frame when the video is scaled down on the device', async (ctx) => {
    const sample = requireDecoding(ctx, device, ffmpegEnvironment().pgsSample, 'h264', device.canDecodeH264);
    if (!device.canEncodeH264) {
      ctx.skip(`'${device.id}' cannot encode h264`);
    }
    const cwd = Path.join(tmpDir, `${safeName}-burn-in-scaled`);

    await runToCompletion(liveTranscodeWithBurnInArgs(fullChain(device, sample), sample, DOWNSCALED_LIVE_TRANSCODE_TARGET), cwd);

    await expectSubtitleBurnedIn(cwd);
  });

  test('Encodes h264 from software-decoded frames', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().h264Sample, 'an h264 sample');
    if (!device.canEncodeH264) {
      ctx.skip(`'${device.id}' cannot encode h264`);
    }
    const outputFile = Path.join(tmpDir, `${safeName}-encode-only.mp4`);

    await runToCompletion(transcodeArgs(new HwContext(device, 'encodeOnly', 8), sample, outputFile), tmpDir);

    expect((await Fs.promises.stat(outputFile)).size).toBeGreaterThan(0);
  });
});

describe('FfmpegJobRunner against real ffmpeg', () => {
  test('Falls through a device that does not exist to software', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().h264Sample, 'an h264 sample');
    const cwd = Path.join(tmpDir, 'runner-fallback');
    await Fs.promises.mkdir(cwd, { recursive: true });

    const bogusDevice = createFfmpegDevice('vaapi', '/dev/dri/renderD999', 'unknown');
    const planner = { plan: async () => [new HwContext(bogusDevice, 'fullChain', 8), SOFTWARE] } as unknown as FfmpegCandidatePlanner;
    const forgetDevice = vi.fn();
    const records: FfmpegAttemptRecord[] = [];
    const stats = new FfmpegJobStats();
    vi.spyOn(stats, 'record').mockImplementation((record) => void records.push(record));
    const runner = new FfmpegJobRunner(container.resolve(FfmpegProcessRunner), planner, { forgetDevice } as unknown as FfmpegCapabilityCache, stats);

    const usedAccel = await runner.run({
      name: 'acceptance-fallback',
      acceleration: { input: toVideoInput(sample), gpuFilters: true, videoEncoder: null },
      spawnOptions: { cwd, timeoutInMillis: 60_000 },
      buildArgs: (accel) => SeekThumbnailGenerator.buildArgs(accel, toVideoInput(sample)),
      awaitOutcome: async (handle, accel) => {
        const exitResult = await handle.waitForExit();
        if (exitResult.exitCode !== 0) {
          throw new Error(`exited with ${exitResult.exitCode}`);
        }
        return accel.id;
      },
    });

    expect(usedAccel).toBe('software');
    expect(records.map((record) => record.verdict)).toEqual(['failed', 'ok']);
    expect(records[0].failureKind).toBe('device');
    expect(forgetDevice).toHaveBeenCalledWith(bogusDevice);
  });

  test('Requires ffmpeg', (ctx) => {
    requireFfmpeg(ctx);
  });
});
