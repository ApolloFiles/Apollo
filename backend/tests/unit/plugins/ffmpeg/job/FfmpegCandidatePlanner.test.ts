import { describe, expect, test } from 'vitest';
import type FfmpegCapabilityCache from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilityCache.js';
import { createFfmpegDevice, type FfmpegDevice } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import type FfmpegDeviceRegistry from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegDeviceRegistry.js';
import HwContext from '../../../../../src/plugins/official/ffmpeg/accel/HwContext.js';
import FfmpegCandidatePlanner from '../../../../../src/plugins/official/ffmpeg/job/FfmpegCandidatePlanner.js';
import type { FfmpegAccelerationRequirement } from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJob.js';

const CUDA = createFfmpegDevice('cuda', '0', 'nvidia');
const INTEL_VAAPI = createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel');
const INTEL_QSV = createFfmpegDevice('qsv', '/dev/dri/renderD128', 'intel');

type Capabilities = {
  readonly decode?: readonly string[];
  readonly encode?: readonly string[];
}

/** The devices whose decode capability was asked for, in order */
const probedDevices: string[] = [];

function createPlanner(devices: FfmpegDevice[], capabilities: Capabilities): FfmpegCandidatePlanner {
  probedDevices.length = 0;
  const registry = { getDevices: async () => devices } as unknown as FfmpegDeviceRegistry;
  const capabilityCache = {
    canDecode: async (device: FfmpegDevice) => {
      probedDevices.push(device.id);
      return (capabilities.decode ?? []).includes(device.id);
    },
    canEncode: async (device: FfmpegDevice) => (capabilities.encode ?? []).includes(device.id),
  } as unknown as FfmpegCapabilityCache;
  return new FfmpegCandidatePlanner(registry, capabilityCache);
}

function requirement(overrides: Partial<FfmpegAccelerationRequirement> = {}): FfmpegAccelerationRequirement {
  return {
    input: { path: '/media/in.mkv', codecName: 'hevc', pixelFormat: 'yuv420p10le', width: 3840, height: 2160 },
    gpuFilters: true,
    videoEncoder: 'h264',
    ...overrides,
  };
}

async function planIds(planner: FfmpegCandidatePlanner, req: FfmpegAccelerationRequirement | null): Promise<string[]> {
  return (await planner.plan(req)).map((accel) => accel.id);
}

describe('FfmpegCandidatePlanner#plan', () => {
  test('A job hardware cannot help gets exactly one software attempt', async () => {
    const planner = createPlanner([CUDA, INTEL_VAAPI], { decode: [CUDA.id], encode: [CUDA.id] });

    await expect(planIds(planner, null)).resolves.toEqual(['software']);
  });

  test('Offers a full chain on every device that decodes and encodes, then encoding only, then software', async () => {
    const planner = createPlanner([CUDA, INTEL_VAAPI], { decode: [CUDA.id, INTEL_VAAPI.id], encode: [CUDA.id, INTEL_VAAPI.id] });

    await expect(planIds(planner, requirement())).resolves.toEqual([
      'cuda:0/fullChain',
      'vaapi:/dev/dri/renderD128/fullChain',
      'cuda:0/encodeOnly',
      'vaapi:/dev/dri/renderD128/encodeOnly',
      'software',
    ]);
  });

  test('A device that cannot decode the input is still offered for encoding', async () => {
    const planner = createPlanner([INTEL_VAAPI], { decode: [], encode: [INTEL_VAAPI.id] });

    await expect(planIds(planner, requirement())).resolves.toEqual(['vaapi:/dev/dri/renderD128/encodeOnly', 'software']);
  });

  test('A device that cannot encode gets no turn at all when the job encodes', async () => {
    const planner = createPlanner([INTEL_VAAPI], { decode: [INTEL_VAAPI.id], encode: [] });

    await expect(planIds(planner, requirement())).resolves.toEqual(['software']);
  });

  test('Image jobs only ask for decoding', async () => {
    const planner = createPlanner([INTEL_VAAPI], { decode: [INTEL_VAAPI.id], encode: [] });

    await expect(planIds(planner, requirement({ videoEncoder: null }))).resolves.toEqual(['vaapi:/dev/dri/renderD128/fullChain', 'software']);
  });

  test('Never offers decoding on the device with the filters in software', async () => {
    const planner = createPlanner([INTEL_VAAPI], { decode: [INTEL_VAAPI.id], encode: [INTEL_VAAPI.id] });

    await expect(planIds(planner, requirement({ gpuFilters: false }))).resolves.toEqual(['vaapi:/dev/dri/renderD128/encodeOnly', 'software']);
  });

  test('Leaves out excluded APIs and excluded ways of running', async () => {
    const planner = createPlanner([INTEL_VAAPI, INTEL_QSV], { decode: [INTEL_VAAPI.id, INTEL_QSV.id], encode: [INTEL_VAAPI.id, INTEL_QSV.id] });

    await expect(planIds(planner, requirement({ excludedApis: ['qsv'], excludedAccelIds: ['vaapi:/dev/dri/renderD128/fullChain'] }))).resolves.toEqual([
      'vaapi:/dev/dri/renderD128/encodeOnly',
      'software',
    ]);
  });

  test('Does not spend a probe on a way of running the caller already ruled out', async () => {
    const planner = createPlanner([CUDA, INTEL_VAAPI], { decode: [CUDA.id, INTEL_VAAPI.id], encode: [CUDA.id, INTEL_VAAPI.id] });

    await planIds(planner, requirement({ excludedAccelIds: ['cuda:0/fullChain'] }));

    expect(probedDevices).toEqual([INTEL_VAAPI.id]);
  });

  test('Hands the input bit depth to the contexts it creates', async () => {
    const planner = createPlanner([CUDA], { decode: [CUDA.id], encode: [CUDA.id] });

    const [fullChain] = await planner.plan(requirement());

    expect(fullChain).toBeInstanceOf(HwContext);
    expect(fullChain.encoderInput()).toEqual(['scale_cuda=format=nv12']);
  });
});
