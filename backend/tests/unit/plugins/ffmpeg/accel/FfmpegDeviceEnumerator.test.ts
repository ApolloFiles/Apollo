import Fs from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegDeviceEnumerator from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceEnumerator.js';
import FakeProcessRunner from '../process/FakeProcessRunner.js';

const ALL_HWACCELS = 'Hardware acceleration methods:\nvdpau\ncuda\nvaapi\nqsv\ndrm\nopencl\nvulkan\n';

type FakeMachine = {
  /** render node name → PCI vendor id as sysfs reports it */
  readonly renderNodes?: Record<string, string | null>;
  readonly nvidiaGpus?: number;
  readonly hwaccels?: string;
}

function fakeMachine(machine: FakeMachine): FfmpegDeviceEnumerator {
  const renderNodes = machine.renderNodes ?? {};

  vi.spyOn(Fs.promises, 'readdir').mockImplementation(async (path) => {
    if (path === '/dev/dri') {
      return ['card0', 'by-path', ...Object.keys(renderNodes)] as never;
    }
    if (path === '/proc/driver/nvidia/gpus') {
      if (machine.nvidiaGpus == null) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return Array.from({ length: machine.nvidiaGpus }, (_, index) => `0000:0${index}:00.0`) as never;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });

  vi.spyOn(Fs.promises, 'readFile').mockImplementation(async (path) => {
    const match = /^\/sys\/class\/drm\/(renderD\d+)\/device\/vendor$/.exec(path.toString());
    const vendorId = match == null ? null : renderNodes[match[1]];
    if (vendorId == null) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return `${vendorId}\n`;
  });

  const processRunner = new FakeProcessRunner([{ exitCode: 0, stdout: machine.hwaccels ?? ALL_HWACCELS }]);
  return new FfmpegDeviceEnumerator(processRunner.asFfmpegProcessRunner());
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

describe('FfmpegDeviceEnumerator#enumerate', () => {
  test('Finds an Intel node as both a VAAPI and a QSV device', async () => {
    const enumerator = fakeMachine({ renderNodes: { renderD128: '0x8086' } });

    await expect(enumerator.enumerate()).resolves.toEqual([
      expect.objectContaining({ id: 'vaapi:/dev/dri/renderD128', vendor: 'intel' }),
      expect.objectContaining({ id: 'qsv:/dev/dri/renderD128', vendor: 'intel' }),
    ]);
  });

  test('Finds an AMD node as a VAAPI device only', async () => {
    const enumerator = fakeMachine({ renderNodes: { renderD129: '0x1002' } });

    await expect(enumerator.enumerate()).resolves.toEqual([
      expect.objectContaining({ id: 'vaapi:/dev/dri/renderD129', vendor: 'amd' }),
    ]);
  });

  test('Reaches an NVIDIA card through CUDA ordinals, not through its render node', async () => {
    const enumerator = fakeMachine({ renderNodes: { renderD128: '0x10de' }, nvidiaGpus: 2 });

    await expect(enumerator.enumerate()).resolves.toEqual([
      expect.objectContaining({ id: 'cuda:0', vendor: 'nvidia', address: '0' }),
      expect.objectContaining({ id: 'cuda:1', vendor: 'nvidia', address: '1' }),
    ]);
  });

  test('Orders CUDA first, then VAAPI on every node, then QSV', async () => {
    const enumerator = fakeMachine({ renderNodes: { renderD129: '0x1002', renderD128: '0x8086' }, nvidiaGpus: 1 });

    const ids = (await enumerator.enumerate()).map((device) => device.id);

    expect(ids).toEqual(['cuda:0', 'vaapi:/dev/dri/renderD128', 'vaapi:/dev/dri/renderD129', 'qsv:/dev/dri/renderD128']);
  });

  test('Still offers VAAPI on a node whose vendor cannot be read', async () => {
    const enumerator = fakeMachine({ renderNodes: { renderD128: null } });

    await expect(enumerator.enumerate()).resolves.toEqual([
      expect.objectContaining({ id: 'vaapi:/dev/dri/renderD128', vendor: 'unknown' }),
    ]);
  });

  test('Only offers APIs this ffmpeg was built with', async () => {
    const enumerator = fakeMachine({
      renderNodes: { renderD128: '0x8086' },
      nvidiaGpus: 1,
      hwaccels: 'Hardware acceleration methods:\nvaapi\n',
    });

    const ids = (await enumerator.enumerate()).map((device) => device.id);

    expect(ids).toEqual(['vaapi:/dev/dri/renderD128']);
  });

  test('Finds nothing on a machine without GPUs instead of failing', async () => {
    const enumerator = fakeMachine({});

    await expect(enumerator.enumerate()).resolves.toEqual([]);
  });

  test('Fails when ffmpeg cannot even say what it was built with', async () => {
    fakeMachine({ renderNodes: { renderD128: '0x8086' } });
    const processRunner = new FakeProcessRunner([{ exitCode: 1, logLines: ['[fatal] Unrecognized option'] }]);
    const enumerator = new FfmpegDeviceEnumerator(processRunner.asFfmpegProcessRunner());

    await expect(enumerator.enumerate()).rejects.toThrow('hardware APIs FFmpeg was built with');
  });
});
