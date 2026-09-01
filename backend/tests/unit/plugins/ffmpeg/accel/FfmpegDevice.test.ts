import { describe, expect, test } from 'vitest';
import { createFfmpegDevice, parseFfmpegDeviceId } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';

describe('parseFfmpegDeviceId', () => {
  test('Round-trips what createFfmpegDevice produces', () => {
    const device = createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd');

    expect(parseFfmpegDeviceId(device.id)).toEqual({ api: 'vaapi', address: '/dev/dri/renderD129' });
    expect(parseFfmpegDeviceId('cuda:1')).toEqual({ api: 'cuda', address: '1' });
  });

  test.each(['cuda', 'cuda:', ':0', 'amf:0', 'vaapi/dev/dri/renderD128'])('Rejects %s', (id) => {
    expect(parseFfmpegDeviceId(id)).toBeNull();
  });
});
