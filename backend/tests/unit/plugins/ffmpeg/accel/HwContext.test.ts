import { createFfmpegDevice } from '#src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import HwContext from '#src/plugins/official/ffmpeg/accel/HwContext.js';

const INTEL_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel');
const AMD_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd');
const INTEL_QSV = createFfmpegDevice('qsv', '/dev/dri/renderD128', 'intel');
const CUDA = createFfmpegDevice('cuda', '0', 'nvidia');

describe(HwContext, () => {
  describe('inputArgs', () => {
    test('Pins the device on every flag and asks for device frames in a full chain', () => {
      expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).inputArgs()).toEqual([
        '-init_hw_device', 'vaapi=gpu:/dev/dri/renderD128', '-filter_hw_device', 'gpu',
        '-hwaccel', 'vaapi', '-hwaccel_device', 'gpu', '-hwaccel_output_format', 'vaapi',
      ]);
    });

    test('Pins QSV through its child device, because -hwaccel_device is ignored there', () => {
      expect(new HwContext(INTEL_QSV, 'fullChain', 8).inputArgs()).toEqual([
        '-init_hw_device', 'qsv=gpu:hw,child_device=/dev/dri/renderD128', '-filter_hw_device', 'gpu',
        '-hwaccel', 'qsv', '-hwaccel_device', 'gpu', '-hwaccel_output_format', 'qsv',
      ]);
    });

    test('Addresses CUDA by ordinal', () => {
      expect(new HwContext(CUDA, 'fullChain', 8).inputArgs()).toContain('cuda=gpu:0');
    });

    test('Only initialises the device when merely encoding on it', () => {
      expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).inputArgs()).toEqual([
        '-init_hw_device', 'vaapi=gpu:/dev/dri/renderD128', '-filter_hw_device', 'gpu',
      ]);
    });
  });

  describe('scale', () => {
    test.for([
      { device: INTEL_VAAPI, width: 240, height: -2, expected: 'scale_vaapi=w=240:h=-2' },
      { device: CUDA, width: -2, height: 720, expected: 'scale_cuda=w=-2:h=720' },
    ])('Scales on $device.id with $expected', ({ device, width, height, expected }) => {
      expect(new HwContext(device, 'fullChain', 8).scale(width, height)).toBe(expected);
    });

    test('Scales in system memory when merely encoding on the device', () => {
      expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).scale(240, -2)).toBe('scale=240:-2');
    });

    test('Uses -1 for "keep the aspect ratio" on QSV, the only value it knows for that', () => {
      expect(new HwContext(INTEL_QSV, 'fullChain', 8).scale(240, -2)).toBe('vpp_qsv=w=240:h=-1');
    });

    test('Leaves the bit depth alone – converting is the job of whatever takes the frames off the device', () => {
      expect(new HwContext(INTEL_VAAPI, 'fullChain', 10).scale(-2, 720)).toBe('scale_vaapi=w=-2:h=720');
    });
  });

  describe('download', () => {
    test('Always names the format, because negotiation picks unusable ones', () => {
      expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).download()).toEqual(['hwdownload', 'format=nv12']);
    });

    test('Downloads nothing when the frames never were on the device', () => {
      expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).download()).toEqual([]);
    });

    test('Converts deeper-than-8-bit frames on the device before bringing them down', () => {
      expect(new HwContext(INTEL_QSV, 'fullChain', 10).download()).toEqual(['vpp_qsv=format=nv12', 'hwdownload', 'format=nv12']);
    });
  });

  describe('encoderInput', () => {
    test('Converts 10-bit frames still on the device before an 8-bit encoder', () => {
      expect(new HwContext(CUDA, 'fullChain', 10).encoderInput()).toEqual(['scale_cuda=format=nv12']);
    });

    test('Leaves 8-bit frames on the device as they are', () => {
      expect(new HwContext(CUDA, 'fullChain', 8).encoderInput()).toEqual([]);
    });

    test('Converts no matter what was asked of the context before, or how often', () => {
      const hwContext = new HwContext(CUDA, 'fullChain', 10);

      const first = hwContext.encoderInput();
      hwContext.scale(-2, 720);
      const second = hwContext.encoderInput();
      const third = hwContext.encoderInput();

      expect([first, second, third]).toEqual([['scale_cuda=format=nv12'], ['scale_cuda=format=nv12'], ['scale_cuda=format=nv12']]);
    });

    test('Uploads system-memory frames for a VAAPI encoder', () => {
      expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).encoderInput()).toEqual(['format=nv12,hwupload']);
    });

    test.for([
      { device: INTEL_QSV },
      { device: CUDA },
    ])('Hands the $device.id encoder system-memory frames', ({ device }) => {
      expect(new HwContext(device, 'encodeOnly', 8).encoderInput()).toEqual(['format=nv12']);
    });
  });

  describe('upload', () => {
    test('Gives QSV the fixed frame pool FFmpeg 6.1 insists on', () => {
      expect(new HwContext(INTEL_QSV, 'fullChain', 8).upload('rgba')).toBe('format=rgba,hwupload=extra_hw_frames=64');
    });

    test.for([
      { device: CUDA, expected: 'format=nv12,hwupload_cuda' },
      { device: INTEL_VAAPI, expected: 'format=nv12,hwupload' },
    ])('Uploads to $device.id with $expected', ({ device, expected }) => {
      expect(new HwContext(device, 'fullChain', 8).upload('nv12')).toBe(expected);
    });
  });

  describe('encoder', () => {
    test.for([
      { device: INTEL_VAAPI, expected: ['-c:v', 'h264_vaapi', '-rc_mode', 'CQP', '-qp', '26'] },
      { device: INTEL_QSV, expected: ['-c:v', 'h264_qsv', '-global_quality', '26'] },
      { device: CUDA, expected: ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '26', '-b:v', '0'] },
    ])('Sets an explicit rate control on $device.id', ({ device, expected }) => {
      expect(new HwContext(device, 'fullChain', 8).encoder('h264', { quality: 26 })).toEqual(expected);
    });
  });

  describe('overlay', () => {
    test.for([
      { device: INTEL_VAAPI, expected: 'overlay_vaapi' },
      { device: INTEL_QSV, expected: 'overlay_qsv' },
    ])('Overlays on $device.id with $expected, which keeps alpha on the device', ({ device, expected }) => {
      expect(new HwContext(device, 'fullChain', 8).overlay()).toBe(expected);
    });

    test.for([
      { device: AMD_VAAPI },
      { device: CUDA },
    ])('Offers no overlay on $device.id, which has none that keeps alpha on the device', ({ device }) => {
      expect(new HwContext(device, 'fullChain', 8).overlay()).toBeNull();
    });

    test('Offers no overlay when merely encoding on the device', () => {
      expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).overlay()).toBeNull();
    });
  });

  describe('id', () => {
    test('Names device and mode', () => {
      expect(new HwContext(INTEL_QSV, 'encodeOnly', 8).id).toBe('qsv:/dev/dri/renderD128/encodeOnly');
    });
  });
});
