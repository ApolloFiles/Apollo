import { beforeEach, describe, expect, test, vi } from 'vitest';
import type AppConfiguration from '../../../../../src/config/AppConfiguration.js';
import FfmpegHardwareAccelerationConfig
  from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegHardwareAccelerationConfig.js';

function createConfig(hardwareAcceleration: string): FfmpegHardwareAccelerationConfig {
  return new FfmpegHardwareAccelerationConfig({ config: { ffmpeg: { hardwareAcceleration } } } as unknown as AppConfiguration);
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('FfmpegHardwareAccelerationConfig#getAllowedAccelerations', () => {
  test('Allows every acceleration when set to auto', () => {
    expect(createConfig('auto').getAllowedAccelerations()).toEqual(['cuda', 'qsv', 'vaapi']);
  });

  test('Allows none when set to off', () => {
    expect(createConfig('off').getAllowedAccelerations()).toEqual([]);
  });

  test('Allows only the one it was pinned to', () => {
    expect(createConfig('vaapi').getAllowedAccelerations()).toEqual(['vaapi']);
  });

  test('Ignores casing and surrounding whitespace', () => {
    expect(createConfig('  VAAPI ').getAllowedAccelerations()).toEqual(['vaapi']);
  });

  test('Falls back to allowing everything when the value is not a known acceleration', () => {
    expect(createConfig('nvidia').getAllowedAccelerations()).toEqual(['cuda', 'qsv', 'vaapi']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("APOLLO_FFMPEG_HARDWARE_ACCELERATION='nvidia'"));
  });

  test('Warns only once, no matter how often it is asked', () => {
    const config = createConfig('nvidia');

    config.getAllowedAccelerations();
    config.getAllowedAccelerations();

    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('FfmpegHardwareAccelerationConfig#isVideoEncoderAllowed', () => {
  test.each(['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264', 'h264_madeup'])('Allows %s when set to auto', (encoder) => {
    expect(createConfig('auto').isVideoEncoderAllowed(encoder)).toBe(true);
  });

  test.each(['h264_nvenc', 'h264_qsv', 'h264_vaapi', 'h264_amf', 'h264_videotoolbox'])(
    'Rejects the hardware encoder %s when set to off',
    (encoder) => {
      expect(createConfig('off').isVideoEncoderAllowed(encoder)).toBe(false);
    },
  );

  test('Still allows a software encoder when set to off', () => {
    expect(createConfig('off').isVideoEncoderAllowed('libx264')).toBe(true);
  });

  test('Maps a pinned acceleration onto the encoder suffix it uses', () => {
    const config = createConfig('cuda');

    expect(config.isVideoEncoderAllowed('h264_nvenc')).toBe(true);
    expect(config.isVideoEncoderAllowed('h264_qsv')).toBe(false);
    expect(config.isVideoEncoderAllowed('libx264')).toBe(true);
  });

  test('Rejects an encoder it cannot place, so that turning acceleration off really does', () => {
    expect(createConfig('off').isVideoEncoderAllowed('h264_madeup')).toBe(false);
  });

  test.each(['auto', 'off', 'cuda'])('Complains about an encoder it cannot place when set to %s', (configuredValue) => {
    createConfig(configuredValue).isVideoEncoderAllowed('h264_madeup');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("video encoder 'h264_madeup'"));
  });

  test('Still allows an encoder it cannot place while nothing is restricted', () => {
    expect(createConfig('auto').isVideoEncoderAllowed('h264_madeup')).toBe(true);
  });

  test('Says nothing about an encoder it can place', () => {
    const config = createConfig('auto');

    config.isVideoEncoderAllowed('libx264');
    config.isVideoEncoderAllowed('h264_nvenc');
    config.isVideoEncoderAllowed('h264_amf');

    expect(console.warn).not.toHaveBeenCalled();
  });

  test('Complains about an encoder it cannot place only once', () => {
    const config = createConfig('auto');

    config.isVideoEncoderAllowed('h264_madeup');
    config.isVideoEncoderAllowed('h264_madeup');

    expect(console.warn).toHaveBeenCalledOnce();
  });
});
