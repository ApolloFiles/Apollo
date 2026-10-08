import type { DeepMockProxy } from 'vitest-mock-extended';
import { createFfmpegDevice } from '#src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import type FfmpegDeviceConfig from '#src/plugins/official/ffmpeg/accel/FfmpegDeviceConfig.js';
import type FfmpegDeviceEnumerator from '#src/plugins/official/ffmpeg/accel/FfmpegDeviceEnumerator.js';
import FfmpegDeviceRegistry from '#src/plugins/official/ffmpeg/accel/FfmpegDeviceRegistry.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const CUDA = createFfmpegDevice('cuda', '0', 'nvidia');
const INTEL_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel');
const AMD_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd');

describe(FfmpegDeviceRegistry, () => {
  let deviceEnumerator: DeepMockProxy<FfmpegDeviceEnumerator>;
  let deviceConfig: DeepMockProxy<FfmpegDeviceConfig>;
  let registry: FfmpegDeviceRegistry;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    deviceEnumerator = createStrictDeepMock<FfmpegDeviceEnumerator>();
    deviceEnumerator.enumerate.mockResolvedValue([CUDA, INTEL_VAAPI, AMD_VAAPI]);
    deviceConfig = createStrictDeepMock<FfmpegDeviceConfig>();
    deviceConfig.getSelection.mockReturnValue({ mode: 'auto' });
    registry = new FfmpegDeviceRegistry(deviceEnumerator, deviceConfig);
  });

  test('Offers every discovered device in discovery order on auto', async () => {
    await expect(registry.getDevices()).resolves.toEqual([CUDA, INTEL_VAAPI, AMD_VAAPI]);
  });

  test('Offers nothing when turned off, without even looking', async () => {
    deviceConfig.getSelection.mockReturnValue({ mode: 'off' });

    await expect(registry.getDevices()).resolves.toEqual([]);
    expect(deviceEnumerator.enumerate).not.toHaveBeenCalled();
  });

  test('Picks and orders the discovered devices by the allowlist', async () => {
    deviceConfig.getSelection.mockReturnValue({ mode: 'allowlist', deviceIds: [AMD_VAAPI.id, CUDA.id] });

    await expect(registry.getDevices()).resolves.toEqual([AMD_VAAPI, CUDA]);
  });

  test('Trusts an allowlisted device that was not discovered, but says so', async () => {
    deviceConfig.getSelection.mockReturnValue({ mode: 'allowlist', deviceIds: ['cuda:1'] });
    deviceEnumerator.enumerate.mockResolvedValue([INTEL_VAAPI]);

    await expect(registry.getDevices()).resolves.toEqual([expect.objectContaining({ id: 'cuda:1', api: 'cuda', address: '1', vendor: 'unknown' })]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("'cuda:1'"));
  });

  test('Discovers only once, also for callers asking at the same time', async () => {
    await Promise.all([registry.getDevices(), registry.getDevices()]);
    await registry.getDevices();

    expect(deviceEnumerator.enumerate).toHaveBeenCalledOnce();
  });

  test('Discovers again after a failed discovery', async () => {
    deviceEnumerator.enumerate.mockRejectedValueOnce(new Error('ffmpeg is missing'));
    await expect(registry.getDevices()).rejects.toThrow('ffmpeg is missing');

    await expect(registry.getDevices()).resolves.toEqual([CUDA, INTEL_VAAPI, AMD_VAAPI]);
  });
});
