import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegCapabilityCache from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilityCache.js';
import { createFfmpegDevice } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import FakeProcessRunner, { type ScriptedAttempt } from '../process/FakeProcessRunner.js';

const INTEL_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel');
const INTEL_QSV = createFfmpegDevice('qsv', '/dev/dri/renderD128', 'intel');
const H264_INPUT = { path: '/media/in.mkv', codecName: 'h264', bitDepth: 8 as const, width: 1920, height: 1080 };
const HEVC10_INPUT = { path: '/media/in10.mkv', codecName: 'hevc', bitDepth: 10 as const, width: 3840, height: 2160 };

function createCache(script: ScriptedAttempt[]): { cache: FfmpegCapabilityCache, processRunner: FakeProcessRunner } {
  const processRunner = new FakeProcessRunner(script);
  return { cache: new FfmpegCapabilityCache(processRunner.asFfmpegProcessRunner()), processRunner };
}

let now = 1_000_000;

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  now = 1_000_000;
});

describe('FfmpegCapabilityCache#canDecode', () => {
  test('Probes one frame of the given input, pulled back off the device so a silent software fallback cannot pass', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }]);

    await expect(cache.canDecode(INTEL_VAAPI, HEVC10_INPUT)).resolves.toBe(true);

    const args = processRunner.spawnCalls[0].args;
    expect(args).toContain('-hwaccel_output_format');
    expect(args[args.indexOf('-hwaccel_output_format') + 1]).toBe('vaapi');
    expect(args).toContain('/media/in10.mkv');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale_vaapi=format=nv12,hwdownload,format=nv12');
    expect(args).toContain('-frames:v');
    expect(processRunner.spawnCalls[0].options?.timeoutInMillis).toBeGreaterThan(0);
  });

  test('Caps how far it reads, so a file whose every packet fails does not sit out the whole timeout', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }]);

    await cache.canDecode(INTEL_VAAPI, H264_INPUT);

    const args = processRunner.spawnCalls[0].args;
    expect(args).toContain('-t');
    expect(args.indexOf('-t')).toBeLessThan(args.indexOf('-i'));
  });

  test('A failing probe means no', async () => {
    const { cache } = createCache([{ exitCode: 218, logLines: ['[error] Impossible to convert between the formats supported by the filter \'graph -1 input from stream 0:0\' and the filter \'auto_scale_0\''] }]);

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(false);
  });

  test('Remembers yes for good and asks once per device, codec, depth and resolution', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 }]);

    await cache.canDecode(INTEL_VAAPI, H264_INPUT);
    now += 24 * 60 * 60_000;
    await cache.canDecode(INTEL_VAAPI, { ...H264_INPUT, path: '/media/other.mkv' });
    await cache.canDecode(INTEL_VAAPI, HEVC10_INPUT);
    await cache.canDecode(INTEL_VAAPI, { ...H264_INPUT, width: 7680, height: 4320 });

    expect(processRunner.spawnCalls).toHaveLength(3);
  });

  test('Does not take a 1080p yes as an answer for 8K', async () => {
    const { cache } = createCache([{ exitCode: 0 }, { exitCode: 234, logLines: ['[hevc @ 0x1] [error] Hardware does not support decoding at size 7680x4320'] }]);

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(true);
    await expect(cache.canDecode(INTEL_VAAPI, { ...H264_INPUT, width: 7680, height: 4320 })).resolves.toBe(false);
  });

  test('Asks again after a no has aged', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 69 }, { exitCode: 0 }]);

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(false);
    now += 60_000;
    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(false);
    now += 10 * 60_000;
    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(true);

    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Forgets a probe that could not run at all, so the next caller tries again', async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0 }]);
    const spawn = vi.spyOn(processRunner, 'spawn').mockImplementationOnce(() => {
      throw new Error('spawn failed');
    });
    const cache = new FfmpegCapabilityCache(processRunner.asFfmpegProcessRunner());

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).rejects.toThrow('spawn failed');
    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(true);

    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test('Callers asking at the same time share one probe', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }]);

    const answers = await Promise.all([cache.canDecode(INTEL_VAAPI, H264_INPUT), cache.canDecode(INTEL_VAAPI, H264_INPUT)]);

    expect(answers).toEqual([true, true]);
    expect(processRunner.spawnCalls).toHaveLength(1);
  });

  test('Tells devices apart', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }, { exitCode: 69 }]);

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(true);
    await expect(cache.canDecode(INTEL_QSV, H264_INPUT)).resolves.toBe(false);

    expect(processRunner.spawnCalls).toHaveLength(2);
  });
});

describe('FfmpegCapabilityCache#canEncode', () => {
  test('Feeds the encoder frames the way a real job does, which is a test h264_vaapi can pass', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }]);

    await expect(cache.canEncode(INTEL_VAAPI, 'h264')).resolves.toBe(true);

    const args = processRunner.spawnCalls[0].args;
    expect(args).toContain('h264_vaapi');
    expect(args[args.indexOf('-vf') + 1]).toContain('hwupload');
    expect(args).toContain('-init_hw_device');
  });

  test('An encoder the device does not have means no', async () => {
    const { cache } = createCache([{ exitCode: 234, logLines: ['[h264_vaapi @ 0x1] [error] No usable encoding profile found.'] }]);

    await expect(cache.canEncode(INTEL_VAAPI, 'h264')).resolves.toBe(false);
  });

  test('Is cached independently of decoding', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }, { exitCode: 0 }]);

    await cache.canDecode(INTEL_VAAPI, H264_INPUT);
    await cache.canEncode(INTEL_VAAPI, 'h264');
    await cache.canEncode(INTEL_VAAPI, 'h264');

    expect(processRunner.spawnCalls).toHaveLength(2);
  });
});

describe('FfmpegCapabilityCache#forgetDevice', () => {
  test('Does not let a probe that was still running when it was forgotten leave its answer behind', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }, { exitCode: 69 }]);

    const staleAnswer = cache.canDecode(INTEL_VAAPI, H264_INPUT);
    cache.forgetDevice(INTEL_VAAPI);
    await expect(staleAnswer).resolves.toBe(true);

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(false);
    expect(processRunner.spawnCalls).toHaveLength(2);
  });

  test('Makes the device answer for itself again, and leaves the others alone', async () => {
    const { cache, processRunner } = createCache([{ exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 }, { exitCode: 69 }]);
    await cache.canDecode(INTEL_VAAPI, H264_INPUT);
    await cache.canEncode(INTEL_VAAPI, 'h264');
    await cache.canDecode(INTEL_QSV, H264_INPUT);

    cache.forgetDevice(INTEL_VAAPI);

    await expect(cache.canDecode(INTEL_VAAPI, H264_INPUT)).resolves.toBe(false);
    await expect(cache.canDecode(INTEL_QSV, H264_INPUT)).resolves.toBe(true);
    expect(processRunner.spawnCalls).toHaveLength(4);
  });
});
