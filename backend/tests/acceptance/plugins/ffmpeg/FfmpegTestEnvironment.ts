import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { container } from 'tsyringe';
import { inject, type TestContext } from 'vitest';
import FfmpegCapabilityCache from '../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilityCache.js';
import type { FfmpegDevice } from '../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import FfmpegDeviceRegistry from '../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceRegistry.js';
import FfmpegProcessRunner from '../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';

export type FfmpegTestSample = {
  readonly path: string;
  readonly codecName: string;
  readonly pixelFormat: string;
  readonly width: number;
  readonly height: number;
}

export type FfmpegTestDevice = FfmpegDevice & {
  readonly canDecodeH264: boolean;
  /** `null` when there is no 10-bit sample to probe with */
  readonly canDecodeHevc10: boolean | null;
  readonly canEncodeH264: boolean;
}

export type FfmpegTestEnvironment = {
  /** `null` if there is no usable ffmpeg executable at all. */
  readonly ffmpegVersion: string | null;
  readonly sampleDirectory: string;
  /** An h264 8-bit sample, or `null` when this ffmpeg has no encoder to create one with */
  readonly h264Sample: FfmpegTestSample | null;
  /** A 10-bit HEVC sample, or `null` when this ffmpeg has no libx265 */
  readonly hevc10Sample: FfmpegTestSample | null;
  /** An h264 sample with a mono audio stream (index 1) and a PGS subtitle stream (index 2) that paints the whole frame white from 1s to 3s, or `null` without libx264 */
  readonly pgsSample: FfmpegTestSample | null;
  /**
   * Like {@link pgsSample}, but the subtitle canvas is 320x180 over the 640x360 video – sizes real files mix freely.
   * Overlaid unscaled, this canvas covers a quarter of the frame, which is what tells a missing canvas scale apart:
   * an oversized canvas would just be clipped and still look right.
   */
  readonly pgsMismatchedCanvasSample: FfmpegTestSample | null;
  readonly devices: readonly FfmpegTestDevice[];
}

declare module 'vitest' {
  interface ProvidedContext {
    ffmpegEnvironment: FfmpegTestEnvironment;
  }
}

/**
 * What the ffmpeg on this machine can do, probed once per run by `tests/acceptance/global-setup.ts`.
 *
 * Tests that need hardware nobody can be expected to have (a CUDA GPU is absent from GitHub's runners, for example)
 * skip themselves with a reason instead of failing, so they still guard against regressions on a machine that has it.
 */
export function ffmpegEnvironment(): FfmpegTestEnvironment {
  return inject('ffmpegEnvironment');
}

export function requireFfmpeg(ctx: TestContext): FfmpegTestEnvironment {
  const environment = ffmpegEnvironment();
  if (environment.ffmpegVersion == null) {
    ctx.skip('there is no ffmpeg executable on PATH');
  }
  return environment;
}

export function requireSample(ctx: TestContext, sample: FfmpegTestSample | null, description: string): FfmpegTestSample {
  requireFfmpeg(ctx);
  if (sample == null) {
    ctx.skip(`this ffmpeg has no encoder to create ${description} with`);
  }
  return sample!;
}

export async function probeFfmpegEnvironment(): Promise<FfmpegTestEnvironment> {
  const ffmpegProcessRunner = container.resolve(FfmpegProcessRunner);
  const sampleDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-ffmpeg-acceptance-'));

  const ffmpegVersion = await determineFfmpegVersion(ffmpegProcessRunner);
  if (ffmpegVersion == null) {
    return { ffmpegVersion: null, sampleDirectory, h264Sample: null, hevc10Sample: null, pgsSample: null, pgsMismatchedCanvasSample: null, devices: [] };
  }

  const h264Sample = await createSample(ffmpegProcessRunner, sampleDirectory, 'h264', 'libx264', 'yuv420p');
  const hevc10Sample = await createSample(ffmpegProcessRunner, sampleDirectory, 'hevc', 'libx265', 'yuv420p10le');
  const pgsSample = await createPgsSample(ffmpegProcessRunner, sampleDirectory, 'sample-h264-pgs.mkv', [640, 360]);
  const pgsMismatchedCanvasSample = await createPgsSample(ffmpegProcessRunner, sampleDirectory, 'sample-h264-pgs-mismatched-canvas.mkv', [320, 180]);

  return withoutProbeNoise(async () => ({
    ffmpegVersion,
    sampleDirectory,
    h264Sample,
    hevc10Sample,
    pgsSample,
    pgsMismatchedCanvasSample,
    devices: await probeDevices(h264Sample, hevc10Sample),
  }));
}

export function logFfmpegEnvironment(environment: FfmpegTestEnvironment): void {
  if (environment.ffmpegVersion == null) {
    console.info('[ffmpeg] No ffmpeg executable on PATH – every acceptance test that needs it skips itself');
    return;
  }

  console.info(`[ffmpeg] ${environment.ffmpegVersion}`);
  console.info(`[ffmpeg] Samples: h264=${environment.h264Sample != null} hevc10=${environment.hevc10Sample != null} pgs=${environment.pgsSample != null} pgsMismatchedCanvas=${environment.pgsMismatchedCanvasSample != null}`);
  if (environment.devices.length === 0) {
    console.info('[ffmpeg] No hardware devices – every acceptance test that needs one skips itself');
  }
  for (const device of environment.devices) {
    console.info(`[ffmpeg] ${device.id} (${device.vendor}): decode h264=${device.canDecodeH264} hevc10=${device.canDecodeHevc10 ?? 'n/a'}, encode h264=${device.canEncodeH264}`);
  }
}

async function probeDevices(h264Sample: FfmpegTestSample | null, hevc10Sample: FfmpegTestSample | null): Promise<FfmpegTestDevice[]> {
  const capabilityCache = container.resolve(FfmpegCapabilityCache);
  const devices: FfmpegTestDevice[] = [];

  for (const device of await container.resolve(FfmpegDeviceRegistry).getDevices()) {
    devices.push({
      ...device,
      canDecodeH264: h264Sample != null && await capabilityCache.canDecode(device, { ...h264Sample, bitDepth: 8 }),
      canDecodeHevc10: hevc10Sample == null ? null : await capabilityCache.canDecode(device, { ...hevc10Sample, bitDepth: 10 }),
      canEncodeH264: await capabilityCache.canEncode(device, 'h264'),
    });
  }
  return devices;
}

async function createSample(ffmpegProcessRunner: FfmpegProcessRunner, directory: string, codecName: string, encoder: string, pixelFormat: string): Promise<FfmpegTestSample | null> {
  const path = Path.join(directory, `sample-${codecName}-${pixelFormat}.mp4`);
  const handle = ffmpegProcessRunner.spawn([
    '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25',
    '-t', '4',
    '-g', '25',
    '-c:v', encoder,
    '-pix_fmt', pixelFormat,
    '-tag:v', codecName === 'hevc' ? 'hvc1' : 'avc1',
    '-y', path,
  ], { logVerbosity: 'error', timeoutInMillis: 60_000 });

  const exitResult = await handle.waitForExit();
  if (exitResult.exitCode !== 0) {
    return null;
  }
  return { path, codecName, pixelFormat, width: 640, height: 360 };
}

/** No encoder in ffmpeg produces bitmap subtitles from anything but bitmap subtitles, so the PGS stream is written by hand */
async function createPgsSample(ffmpegProcessRunner: FfmpegProcessRunner, directory: string, fileName: string, canvasSize: [width: number, height: number]): Promise<FfmpegTestSample | null> {
  const width = 640;
  const height = 360;
  const subtitlePath = Path.join(directory, `${fileName}.sup`);
  await Fs.promises.writeFile(subtitlePath, whitePgsStream(canvasSize[0], canvasSize[1], 1, 3));

  const path = Path.join(directory, fileName);
  const handle = ffmpegProcessRunner.spawn([
    '-f', 'lavfi', '-i', `testsrc2=s=${width}x${height}:r=25`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-i', subtitlePath,
    '-t', '4',
    '-g', '25',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-c:s', 'copy',
    '-y', path,
  ], { logVerbosity: 'error', timeoutInMillis: 60_000 });

  const exitResult = await handle.waitForExit();
  if (exitResult.exitCode !== 0) {
    return null;
  }
  return { path, codecName: 'h264', pixelFormat: 'yuv420p', width, height };
}

/**
 * A Presentation Graphic Stream with a single object of one opaque white colour covering the whole canvas, shown from
 * `startSeconds` and cleared at `endSeconds`. An empty display set at 0 keeps the muxer from shifting the stream, which
 * treats the first packet as its start.
 */
function whitePgsStream(width: number, height: number, startSeconds: number, endSeconds: number): Buffer {
  const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  const u24 = (n: number) => [(n >> 16) & 0xff, ...u16(n & 0xffff)];
  const u32 = (n: number) => [...u16(n >>> 16), ...u16(n & 0xffff)];
  const segment = (type: number, seconds: number, payload: number[]) => Buffer.from([0x50, 0x47, ...u32(Math.round(seconds * 90_000)), ...u32(0), type, ...u16(payload.length), ...payload]);

  const presentation = (seconds: number, compositionNumber: number, epochStart: boolean, withObject: boolean) => segment(0x16, seconds, [
    ...u16(width), ...u16(height), 0x10, ...u16(compositionNumber), epochStart ? 0x80 : 0x00, 0x00, 0x00,
    ...(withObject ? [0x01, ...u16(0), 0x00, 0x00, ...u16(0), ...u16(0)] : [0x00]),
  ]);
  const window = (seconds: number) => segment(0x17, seconds, [0x01, 0x00, ...u16(0), ...u16(0), ...u16(width), ...u16(height)]);
  const palette = (seconds: number) => segment(0x14, seconds, [0x00, 0x00, /* entry 1 = */ 0x01, /* Y */ 235, /* Cr */ 128, /* Cb */ 128, /* alpha */ 255]);
  const object = (seconds: number) => {
    const line = [0x00, 0xc0 | (width >> 8), width & 0xff, 0x01, 0x00, 0x00];  // run of `width` pixels of entry 1, end of line
    const rle = Array<number[]>(height).fill(line).flat();
    return segment(0x15, seconds, [...u16(0), 0x00, 0xc0, ...u24(rle.length + 4), ...u16(width), ...u16(height), ...rle]);
  };
  const end = (seconds: number) => segment(0x80, seconds, []);

  return Buffer.concat([
    presentation(0, 0, true, false), window(0), end(0),
    presentation(startSeconds, 1, false, true), window(startSeconds), palette(startSeconds), object(startSeconds), end(startSeconds),
    presentation(endSeconds, 2, false, false), window(endSeconds), end(endSeconds),
  ]);
}

async function determineFfmpegVersion(ffmpegProcessRunner: FfmpegProcessRunner): Promise<string | null> {
  try {
    const handle = ffmpegProcessRunner.spawn(['-version'], { captureStdout: true, timeoutInMillis: 15_000 });

    const exitResult = await handle.waitForExit();
    if (exitResult.exitCode !== 0) {
      return null;
    }
    return handle.getStdout().split('\n')[0].trim();
  } catch {
    return null;
  }
}

/** Probing hardware this machine does not have is expected here, and every turned-down probe logs the whole ffmpeg output */
async function withoutProbeNoise<T>(fn: () => Promise<T>): Promise<T> {
  const originalConsoleDebug = console.debug;
  console.debug = () => undefined;
  try {
    return await fn();
  } finally {
    console.debug = originalConsoleDebug;
  }
}
