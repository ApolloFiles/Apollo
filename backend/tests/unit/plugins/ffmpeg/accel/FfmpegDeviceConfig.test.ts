import { beforeEach, describe, expect, test, vi } from 'vitest';
import type AppConfiguration from '../../../../../src/config/AppConfiguration.js';
import FfmpegDeviceConfig from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceConfig.js';

function createConfig(devices: string): FfmpegDeviceConfig {
  return new FfmpegDeviceConfig({ config: { ffmpeg: { devices } } } as unknown as AppConfiguration);
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('FfmpegDeviceConfig#getSelection', () => {
  test.each(['auto', ' AUTO ', ''])("'%s' means every device", (value) => {
    expect(createConfig(value).getSelection()).toEqual({ mode: 'auto' });
  });

  test("'off' means no device", () => {
    expect(createConfig('off').getSelection()).toEqual({ mode: 'off' });
  });

  test('Keeps an allowlist in the order it was written', () => {
    expect(createConfig(' vaapi:/dev/dri/renderD129 ,cuda:0').getSelection()).toEqual({
      mode: 'allowlist',
      deviceIds: ['vaapi:/dev/dri/renderD129', 'cuda:0'],
    });
  });

  test('Drops ids it cannot parse and says so', () => {
    expect(createConfig('nvidia,cuda:0').getSelection()).toEqual({ mode: 'allowlist', deviceIds: ['cuda:0'] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("'nvidia'"));
  });

  test('Falls back to auto when nothing in the list is usable', () => {
    expect(createConfig('nvidia').getSelection()).toEqual({ mode: 'auto' });
  });
});
