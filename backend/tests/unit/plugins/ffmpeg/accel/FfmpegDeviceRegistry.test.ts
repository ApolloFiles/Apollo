import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createFfmpegDevice, type FfmpegDevice } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import type FfmpegDeviceConfig from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceConfig.js';
import type { FfmpegDeviceSelection } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceConfig.js';
import type FfmpegDeviceEnumerator from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceEnumerator.js';
import FfmpegDeviceRegistry from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceRegistry.js';

const CUDA = createFfmpegDevice('cuda', '0', 'nvidia');
const INTEL_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel');
const AMD_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd');

function createRegistry(selection: FfmpegDeviceSelection, discovered: FfmpegDevice[] | Error): { registry: FfmpegDeviceRegistry, enumerate: ReturnType<typeof vi.fn> } {
  const enumerate = vi.fn(async () => {
    if (discovered instanceof Error) {
      throw discovered;
    }
    return discovered;
  });
  const enumerator = { enumerate } as unknown as FfmpegDeviceEnumerator;
  const config = { getSelection: () => selection } as unknown as FfmpegDeviceConfig;
  return { registry: new FfmpegDeviceRegistry(enumerator, config), enumerate };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('FfmpegDeviceRegistry#getDevices', () => {
  test('Offers every discovered device in discovery order on auto', async () => {
    const { registry } = createRegistry({ mode: 'auto' }, [CUDA, INTEL_VAAPI, AMD_VAAPI]);

    await expect(registry.getDevices()).resolves.toEqual([CUDA, INTEL_VAAPI, AMD_VAAPI]);
  });

  test('Offers nothing when turned off, without even looking', async () => {
    const { registry, enumerate } = createRegistry({ mode: 'off' }, [CUDA]);

    await expect(registry.getDevices()).resolves.toEqual([]);
    expect(enumerate).not.toHaveBeenCalled();
  });

  test('An allowlist picks and orders the discovered devices', async () => {
    const { registry } = createRegistry({ mode: 'allowlist', deviceIds: [AMD_VAAPI.id, CUDA.id] }, [CUDA, INTEL_VAAPI, AMD_VAAPI]);

    await expect(registry.getDevices()).resolves.toEqual([AMD_VAAPI, CUDA]);
  });

  test('Trusts an allowlisted device that was not discovered, but says so', async () => {
    const { registry } = createRegistry({ mode: 'allowlist', deviceIds: ['cuda:1'] }, [INTEL_VAAPI]);

    await expect(registry.getDevices()).resolves.toEqual([expect.objectContaining({ id: 'cuda:1', api: 'cuda', address: '1', vendor: 'unknown' })]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("'cuda:1'"));
  });

  test('Discovers once and remembers', async () => {
    const { registry, enumerate } = createRegistry({ mode: 'auto' }, [CUDA]);

    await Promise.all([registry.getDevices(), registry.getDevices()]);
    await registry.getDevices();

    expect(enumerate).toHaveBeenCalledOnce();
  });

  test('Tries discovering again after it failed', async () => {
    const { registry, enumerate } = createRegistry({ mode: 'auto' }, new Error('ffmpeg is missing'));

    await expect(registry.getDevices()).rejects.toThrow('ffmpeg is missing');
    await expect(registry.getDevices()).rejects.toThrow('ffmpeg is missing');

    expect(enumerate).toHaveBeenCalledTimes(2);
  });
});
