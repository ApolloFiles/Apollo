import { container } from 'tsyringe';
import { inject, type TestContext } from 'vitest';
import FfmpegCapabilities from '../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilities.js';
import {
  FFMPEG_HARDWARE_ACCELERATIONS,
  type FfmpegHardwareAcceleration,
} from '../../../../src/plugins/official/ffmpeg/accel/FfmpegHardwareAcceleration.js';
import FfmpegLogLineParser from '../../../../src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';
import FfmpegProcessRunner from '../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';

/** The encoders Apollo asks for in production, most favorable first. */
export const CANDIDATE_VIDEO_ENCODERS = ['h264_nvenc', 'h264_qsv', 'libx264'] as const;

export type FfmpegTestEnvironment = {
  /** `null` if there is no usable ffmpeg executable at all. */
  readonly ffmpegVersion: string | null;
  readonly usableVideoEncoders: readonly string[];
  readonly usableDecodeAccelerations: readonly FfmpegHardwareAcceleration[];
  /** One line per candidate the capability probe turned down, saying why. */
  readonly rejections: readonly string[];
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

export function requireVideoEncoder(ctx: TestContext, encoder: string): FfmpegTestEnvironment {
  const environment = requireFfmpeg(ctx);
  if (!environment.usableVideoEncoders.includes(encoder)) {
    ctx.skip(`this machine has no usable '${encoder}' video encoder (usable: ${environment.usableVideoEncoders.join(', ') || 'none'})`);
  }
  return environment;
}

export function requireDecodeAcceleration(ctx: TestContext, acceleration: FfmpegHardwareAcceleration): FfmpegTestEnvironment {
  const environment = requireFfmpeg(ctx);
  if (!environment.usableDecodeAccelerations.includes(acceleration)) {
    ctx.skip(`this machine cannot create a '${acceleration}' hardware device (usable: ${environment.usableDecodeAccelerations.join(', ') || 'none'})`);
  }
  return environment;
}

export async function probeFfmpegEnvironment(): Promise<FfmpegTestEnvironment> {
  const ffmpegProcessRunner = container.resolve(FfmpegProcessRunner);

  const ffmpegVersion = await determineFfmpegVersion(ffmpegProcessRunner);
  if (ffmpegVersion == null) {
    return { ffmpegVersion: null, usableVideoEncoders: [], usableDecodeAccelerations: [], rejections: [] };
  }

  const ffmpegCapabilities = container.resolve(FfmpegCapabilities);
  const probeMessages: string[] = [];

  // A probe turning down hardware this machine does not have is expected here, and its debug output is long enough
  // to bury the test results – #summarizeRejections keeps the one line per candidate that actually says why
  const originalConsoleDebug = console.debug;
  console.debug = (...args: unknown[]) => probeMessages.push(args.join(' '));

  try {
    const [usableVideoEncoders, usableDecodeAccelerations] = await Promise.all([
      ffmpegCapabilities.filterUsableVideoEncoders(CANDIDATE_VIDEO_ENCODERS),
      ffmpegCapabilities.getUsableDecodeAccelerations(),
    ]);

    return {
      ffmpegVersion,
      usableVideoEncoders,
      usableDecodeAccelerations,
      rejections: summarizeRejections(probeMessages),
    };
  } finally {
    console.debug = originalConsoleDebug;
  }
}

export function logFfmpegEnvironment(environment: FfmpegTestEnvironment): void {
  if (environment.ffmpegVersion == null) {
    console.info('[ffmpeg] No ffmpeg executable on PATH – every acceptance test that needs it skips itself');
    return;
  }

  console.info(`[ffmpeg] ${environment.ffmpegVersion}`);
  console.info(`[ffmpeg] Usable video encoders: ${environment.usableVideoEncoders.join(', ') || '<none>'}`);
  console.info(`[ffmpeg] Usable decode accelerations: ${environment.usableDecodeAccelerations.join(', ') || '<none>'}`);
  for (const rejection of environment.rejections) {
    console.info(`[ffmpeg]   ${rejection}`);
  }
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

function summarizeRejections(probeMessages: readonly string[]): string[] {
  const rejections: string[] = [];

  for (const probeMessage of probeMessages) {
    const [headline, ...detailLines] = probeMessage.split('\n');
    if (!headline.includes('not usable') && !headline.includes('cannot create')) {
      continue;
    }

    const firstProblem = detailLines.find((line) => line.includes('[error]') || line.includes('[fatal]'));
    if (firstProblem == null) {
      rejections.push(headline);
      continue;
    }
    rejections.push(`${headline.replace(/:$/, '')} – ${FfmpegLogLineParser.parse(firstProblem).message}`);
  }

  return rejections;
}

export { FFMPEG_HARDWARE_ACCELERATIONS, type FfmpegHardwareAcceleration };
