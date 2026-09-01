import { describe, expect, test } from 'vitest';
import { createFfmpegDevice } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import HwContext from '../../../../../src/plugins/official/ffmpeg/accel/HwContext.js';

const INTEL_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel');
const AMD_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd');
const INTEL_QSV = createFfmpegDevice('qsv', '/dev/dri/renderD128', 'intel');
const CUDA = createFfmpegDevice('cuda', '0', 'nvidia');

describe('HwContext#inputArgs', () => {
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

describe('HwContext#scale', () => {
  test('Uses the device filter with frames on the device and plain scale otherwise', () => {
    expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).scale(240, -2)).toBe('scale_vaapi=w=240:h=-2');
    expect(new HwContext(CUDA, 'fullChain', 8).scale(-2, 720)).toBe('scale_cuda=w=-2:h=720');
    expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).scale(240, -2)).toBe('scale=240:-2');
  });

  test('QSV only knows -1 for "keep the aspect ratio"', () => {
    expect(new HwContext(INTEL_QSV, 'fullChain', 8).scale(240, -2)).toBe('vpp_qsv=w=240:h=-1');
  });

  test('Leaves the bit depth alone – converting is the job of whatever takes the frames off the device', () => {
    expect(new HwContext(INTEL_VAAPI, 'fullChain', 10).scale(-2, 720)).toBe('scale_vaapi=w=-2:h=720');
  });
});

describe('HwContext#download', () => {
  test('Always names the format, because negotiation picks unusable ones', () => {
    expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).download()).toEqual(['hwdownload', 'format=nv12']);
    expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).download()).toEqual([]);
  });

  test('Converts deeper-than-8-bit frames on the device before bringing them down', () => {
    expect(new HwContext(INTEL_QSV, 'fullChain', 10).download()).toEqual(['vpp_qsv=format=nv12', 'hwdownload', 'format=nv12']);
  });
});

describe('HwContext#encoderInput', () => {
  test('Converts 10-bit frames still on the device before an 8-bit encoder', () => {
    expect(new HwContext(CUDA, 'fullChain', 10).encoderInput()).toEqual(['scale_cuda=format=nv12']);
    expect(new HwContext(CUDA, 'fullChain', 8).encoderInput()).toEqual([]);
  });

  test('Does so no matter what was asked of the context before, or how often', () => {
    const hwContext = new HwContext(CUDA, 'fullChain', 10);

    expect(hwContext.encoderInput()).toEqual(['scale_cuda=format=nv12']);
    hwContext.scale(-2, 720);
    expect(hwContext.encoderInput()).toEqual(['scale_cuda=format=nv12']);
    expect(hwContext.encoderInput()).toEqual(['scale_cuda=format=nv12']);
  });

  test('Uploads for VAAPI encoders and hands the others system-memory frames', () => {
    expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).encoderInput()).toEqual(['format=nv12,hwupload']);
    expect(new HwContext(INTEL_QSV, 'encodeOnly', 8).encoderInput()).toEqual(['format=nv12']);
    expect(new HwContext(CUDA, 'encodeOnly', 8).encoderInput()).toEqual(['format=nv12']);
  });
});

describe('HwContext#upload', () => {
  test('Gives QSV the fixed frame pool FFmpeg 6.1 insists on', () => {
    expect(new HwContext(INTEL_QSV, 'fullChain', 8).upload('rgba')).toBe('format=rgba,hwupload=extra_hw_frames=64');
    expect(new HwContext(CUDA, 'fullChain', 8).upload('nv12')).toBe('format=nv12,hwupload_cuda');
    expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).upload('nv12')).toBe('format=nv12,hwupload');
  });
});

describe('HwContext#encoder', () => {
  test('Sets an explicit rate control for every encoder', () => {
    expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).encoder('h264', { quality: 26 })).toEqual(['-c:v', 'h264_vaapi', '-rc_mode', 'CQP', '-qp', '26']);
    expect(new HwContext(INTEL_QSV, 'fullChain', 8).encoder('h264', { quality: 26 })).toEqual(['-c:v', 'h264_qsv', '-global_quality', '26']);
    expect(new HwContext(CUDA, 'fullChain', 8).encoder('h264', { quality: 26 })).toEqual(['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '26', '-b:v', '0']);
  });
});

describe('HwContext#overlay', () => {
  test('Only offers overlays that keep alpha on the device', () => {
    expect(new HwContext(INTEL_VAAPI, 'fullChain', 8).overlay()).toBe('overlay_vaapi');
    expect(new HwContext(INTEL_QSV, 'fullChain', 8).overlay()).toBe('overlay_qsv');
    expect(new HwContext(AMD_VAAPI, 'fullChain', 8).overlay()).toBeNull();
    expect(new HwContext(CUDA, 'fullChain', 8).overlay()).toBeNull();
    expect(new HwContext(INTEL_VAAPI, 'encodeOnly', 8).overlay()).toBeNull();
  });
});

describe('HwContext#id', () => {
  test('Names device and mode', () => {
    expect(new HwContext(INTEL_QSV, 'encodeOnly', 8).id).toBe('qsv:/dev/dri/renderD128/encodeOnly');
  });
});
