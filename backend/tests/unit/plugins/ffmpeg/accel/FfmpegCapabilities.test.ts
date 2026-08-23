import { beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegCapabilities from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilities.js';
import type FfmpegHandle from '../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type FfmpegProcessRunner from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';

const ALL_HWACCELS = 'Hardware acceleration methods:\ncuda\nvaapi\nqsv\nvulkan\n';

type SpawnOutcome = {
  exitCode: number;
  stdout?: string;
};

class FakeFfmpegProcessRunner {
  readonly spawnedArgs: string[][] = [];

  constructor(private readonly outcomeFor: (args: readonly string[]) => SpawnOutcome) {
  }

  spawn(args: readonly string[]): FfmpegHandle {
    this.spawnedArgs.push([...args]);

    const outcome = this.outcomeFor(args);
    return {
      waitForExit: async () => ({ exitCode: outcome.exitCode, signal: null, runtimeInMillis: 1 }),
      getStdout: () => outcome.stdout ?? '',
      getLogProblems: () => (outcome.exitCode === 0 ? '' : '[error] nope'),
    } as unknown as FfmpegHandle;
  }

  asFfmpegProcessRunner(): FfmpegProcessRunner {
    return this as unknown as FfmpegProcessRunner;
  }

  countSpawnsContaining(argument: string): number {
    return this.spawnedArgs.filter((args) => args.includes(argument)).length;
  }
}

function valueAfter(args: readonly string[], option: string): string | undefined {
  const optionIndex = args.indexOf(option);
  return optionIndex === -1 ? undefined : args[optionIndex + 1];
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('FfmpegCapabilities#getUsableDecodeAccelerations', () => {
  test('Returns the accelerations whose hardware device can be created, most favorable first', async () => {
    const runner = new FakeFfmpegProcessRunner((args) => {
      if (args.includes('-hwaccels')) {
        return { exitCode: 0, stdout: ALL_HWACCELS };
      }
      return { exitCode: valueAfter(args, '-init_hw_device') === 'cuda' ? 255 : 0 };
    });

    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    expect(await capabilities.getUsableDecodeAccelerations()).toEqual(['qsv', 'vaapi']);
  });

  test('Does not probe an acceleration ffmpeg was not built with', async () => {
    const runner = new FakeFfmpegProcessRunner((args) => {
      if (args.includes('-hwaccels')) {
        return { exitCode: 0, stdout: 'Hardware acceleration methods:\nvaapi\n' };
      }
      return { exitCode: 0 };
    });

    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    expect(await capabilities.getUsableDecodeAccelerations()).toEqual(['vaapi']);
    expect(runner.countSpawnsContaining('-init_hw_device')).toBe(1);
  });

  test('Returns nothing when no hardware device can be created', async () => {
    const runner = new FakeFfmpegProcessRunner((args) => ({
      exitCode: args.includes('-hwaccels') ? 0 : 255,
      stdout: ALL_HWACCELS,
    }));

    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    expect(await capabilities.getUsableDecodeAccelerations()).toEqual([]);
  });

  test('Probes only once, no matter how often it is asked', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0, stdout: ALL_HWACCELS }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    await Promise.all([capabilities.getUsableDecodeAccelerations(), capabilities.getUsableDecodeAccelerations()]);
    await capabilities.getUsableDecodeAccelerations();

    expect(runner.countSpawnsContaining('-hwaccels')).toBe(1);
    expect(runner.countSpawnsContaining('-init_hw_device')).toBe(3);
  });

  test('Throws when ffmpeg cannot be asked what it was built with', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 1 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    await expect(capabilities.getUsableDecodeAccelerations()).rejects.toThrow(/hardware accelerations FFmpeg was built with/);
  });
});

describe('FfmpegCapabilities#markDecodeAccelerationUnusable', () => {
  test('Stops offering the acceleration without probing again', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0, stdout: ALL_HWACCELS }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    expect(await capabilities.getUsableDecodeAccelerations()).toEqual(['cuda', 'qsv', 'vaapi']);
    capabilities.markDecodeAccelerationUnusable('cuda', 'failed on a real input file');

    expect(await capabilities.getUsableDecodeAccelerations()).toEqual(['qsv', 'vaapi']);
    expect(runner.countSpawnsContaining('-hwaccels')).toBe(1);
  });

  test('Warns about an acceleration only the first time it is marked', () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0, stdout: ALL_HWACCELS }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    capabilities.markDecodeAccelerationUnusable('cuda', 'failed once');
    capabilities.markDecodeAccelerationUnusable('cuda', 'failed again');

    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('FfmpegCapabilities#filterUsableVideoEncoders', () => {
  test('Keeps the order the candidates were given in', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    const usableEncoders = await capabilities.filterUsableVideoEncoders(['h264_nvenc', 'h264_qsv', 'libx264']);

    expect(usableEncoders).toEqual(['h264_nvenc', 'h264_qsv', 'libx264']);
  });

  test('Drops the encoders that cannot be used on this machine', async () => {
    const runner = new FakeFfmpegProcessRunner((args) => ({
      exitCode: valueAfter(args, '-c:v') === 'libx264' ? 0 : 255,
    }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    const usableEncoders = await capabilities.filterUsableVideoEncoders(['h264_nvenc', 'h264_qsv', 'libx264']);

    expect(usableEncoders).toEqual(['libx264']);
  });

  test('Probes each encoder only once', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    await capabilities.filterUsableVideoEncoders(['h264_nvenc', 'libx264']);
    await capabilities.filterUsableVideoEncoders(['h264_nvenc', 'libx264']);

    expect(runner.countSpawnsContaining('-c:v')).toBe(2);
  });

  test('Probes the encoder against a real frame', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    await capabilities.isVideoEncoderUsable('libx264');

    expect(valueAfter(runner.spawnedArgs[0], '-frames:v')).toBe('1');
    expect(valueAfter(runner.spawnedArgs[0], '-c:v')).toBe('libx264');
  });
});

describe('FfmpegCapabilities#markVideoEncoderUnusable', () => {
  test('Stops offering the encoder without probing it', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    capabilities.markVideoEncoderUnusable('h264_nvenc', 'failed on a real input file');

    expect(await capabilities.filterUsableVideoEncoders(['h264_nvenc', 'libx264'])).toEqual(['libx264']);
    expect(runner.countSpawnsContaining('h264_nvenc')).toBe(0);
  });

  test('Warns about an encoder only the first time it is marked', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    capabilities.markVideoEncoderUnusable('h264_nvenc', 'failed once');
    capabilities.markVideoEncoderUnusable('h264_nvenc', 'failed again');

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  test('Stops offering an encoder that was usable before', async () => {
    const runner = new FakeFfmpegProcessRunner(() => ({ exitCode: 0 }));
    const capabilities = new FfmpegCapabilities(runner.asFfmpegProcessRunner());

    expect(await capabilities.isVideoEncoderUsable('h264_nvenc')).toBe(true);
    capabilities.markVideoEncoderUnusable('h264_nvenc', 'failed on a real input file');

    expect(await capabilities.isVideoEncoderUsable('h264_nvenc')).toBe(false);
  });
});
