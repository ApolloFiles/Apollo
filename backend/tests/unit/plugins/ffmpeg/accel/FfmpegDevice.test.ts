import { createFfmpegDevice, parseFfmpegDeviceId } from '#src/plugins/official/ffmpeg/accel/FfmpegDevice.js';

describe('FfmpegDevice', () => {
  describe(parseFfmpegDeviceId, () => {
    test('Round-trips the id of a created device', () => {
      const device = createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd');

      expect(parseFfmpegDeviceId(device.id)).toEqual({ api: 'vaapi', address: '/dev/dri/renderD129' });
    });

    test('Splits a CUDA id into the API and the ordinal', () => {
      expect(parseFfmpegDeviceId('cuda:1')).toEqual({ api: 'cuda', address: '1' });
    });

    test.for([
      { id: 'cuda' },
      { id: 'cuda:' },
      { id: ':0' },
      { id: 'amf:0' },
      { id: 'vaapi/dev/dri/renderD128' },
    ])('Rejects $id', ({ id }) => {
      expect(parseFfmpegDeviceId(id)).toBeNull();
    });
  });
});
