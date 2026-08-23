import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { container } from 'tsyringe';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegCapabilities from '../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilities.js';
import FfmpegProcessRunner from '../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import {
  CANDIDATE_VIDEO_ENCODERS,
  FFMPEG_DECODE_ACCELERATIONS,
  ffmpegEnvironment,
  requireDecodeAcceleration,
  requireFfmpeg,
  requireVideoEncoder,
} from './FfmpegTestEnvironment.js';

let tmpDir: string;
/** A real h264 file to decode, or `null` if this machine has no encoder to create one with. */
let sampleFilePath: string | null = null;

beforeAll(async () => {
  tmpDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-ffmpeg-acceptance-'));
  sampleFilePath = await createSampleFile();
}, 60_000);

afterAll(async () => {
  await Fs.promises.rm(tmpDir, { recursive: true, force: true });
});

// Probing hardware this machine does not have is the point of these tests, and every rejected candidate logs the
// ffmpeg output explaining itself – which is a lot of lines for something that is expected here
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

async function createSampleFile(): Promise<string | null> {
  const environment = ffmpegEnvironment();
  const encoder = environment.usableVideoEncoders.find((candidate) => candidate === 'libx264') ?? environment.usableVideoEncoders[0];
  if (encoder == null) {
    return null;
  }

  const filePath = Path.join(tmpDir, 'sample.mp4');
  const handle = container.resolve(FfmpegProcessRunner).spawn([
    '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25',
    '-t', '2',
    '-c:v', encoder,
    '-pix_fmt', 'yuv420p',
    '-y', filePath,
  ], { timeoutInMillis: 30_000 });

  const exitResult = await handle.waitForExit();
  if (exitResult.exitCode !== 0) {
    throw new Error(`Failed to create the sample file with '${encoder}':\n${handle.getLogProblems()}`);
  }
  return filePath;
}

describe('FfmpegCapabilities#filterUsableVideoEncoders', () => {
  test('Never reports an encoder that was not asked for', async (ctx) => {
    requireFfmpeg(ctx);

    const usableEncoders = await container.resolve(FfmpegCapabilities).filterUsableVideoEncoders(CANDIDATE_VIDEO_ENCODERS);

    expect(CANDIDATE_VIDEO_ENCODERS).toEqual(expect.arrayContaining(usableEncoders));
  });

  test('Rejects an encoder ffmpeg does not know about', async (ctx) => {
    requireFfmpeg(ctx);

    const isUsable = await container.resolve(FfmpegCapabilities).isVideoEncoderUsable('definitely_not_a_real_encoder');

    expect(isUsable).toBe(false);
  });
});

describe.each(CANDIDATE_VIDEO_ENCODERS)('Video encoder %s', (encoder) => {
  test('Really encodes a file when the probe reported it as usable', async (ctx) => {
    requireVideoEncoder(ctx, encoder);

    const outputFilePath = Path.join(tmpDir, `encoded-with-${encoder}.mp4`);
    const handle = container.resolve(FfmpegProcessRunner).spawn([
      '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25',
      '-t', '1',
      '-c:v', encoder,
      '-pix_fmt', 'yuv420p',
      '-y', outputFilePath,
    ], { timeoutInMillis: 30_000 });

    const exitResult = await handle.waitForExit();

    expect(exitResult.exitCode, handle.getLogProblems()).toBe(0);
    expect((await Fs.promises.stat(outputFilePath)).size).toBeGreaterThan(0);
  });
});

describe('FfmpegCapabilities#getUsableDecodeAccelerations', () => {
  test('Never reports an acceleration Apollo does not know how to use', async (ctx) => {
    requireFfmpeg(ctx);

    const usableAccelerations = await container.resolve(FfmpegCapabilities).getUsableDecodeAccelerations();

    expect(FFMPEG_DECODE_ACCELERATIONS).toEqual(expect.arrayContaining(usableAccelerations));
  });
});

describe.each(FFMPEG_DECODE_ACCELERATIONS)('Decode acceleration %s', (acceleration) => {
  /**
   * The regression this guards against: an acceleration that the probe accepted but that makes FFmpeg die without
   * writing any output, which used to surface as a missing thumbnail or a live-transcode that never starts.
   */
  test('Really decodes a file when the probe reported it as usable', async (ctx) => {
    requireDecodeAcceleration(ctx, acceleration);
    const inputFilePath = sampleFilePath;
    if (inputFilePath == null) {
      ctx.skip('this machine has no usable video encoder to create a sample file with');
      return;
    }

    const outputFilePath = Path.join(tmpDir, `decoded-with-${acceleration}.png`);
    const handle = container.resolve(FfmpegProcessRunner).spawn([
      '-hwaccel', acceleration,
      '-i', inputFilePath,
      '-frames:v', '1',
      '-c:v', 'png',
      '-y', outputFilePath,
    ], { timeoutInMillis: 30_000 });

    const exitResult = await handle.waitForExit();

    expect(exitResult.exitCode, handle.getLogProblems()).toBe(0);
    expect((await Fs.promises.stat(outputFilePath)).size).toBeGreaterThan(0);
  });
});
