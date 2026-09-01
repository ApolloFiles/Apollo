import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import FfmpegProcessRunner from '../process/FfmpegProcessRunner.js';
import { createFfmpegDevice, type FfmpegDevice, type FfmpegDeviceVendor } from './FfmpegDevice.js';

const PCI_VENDOR_IDS: Record<string, FfmpegDeviceVendor> = {
  '0x8086': 'intel',
  '0x1002': 'amd',
  '0x10de': 'nvidia',
};

/**
 * Finds the GPUs this machine has, in the order they are tried when nothing is pinned: CUDA, then VAAPI on every
 * render node, then QSV.
 *
 * Render nodes are read from sysfs rather than `/dev/dri/by-path`, which a container started with `--device /dev/dri`
 * does not get. CUDA devices come from the driver's procfs entries, which only exist once the NVIDIA runtime has
 * injected the driver – so a container started without `--gpus` simply finds none instead of failing later.
 */
@singleton()
export default class FfmpegDeviceEnumerator {
  private static readonly DRI_DIRECTORY = '/dev/dri';
  private static readonly DRM_SYSFS_DIRECTORY = '/sys/class/drm';
  private static readonly NVIDIA_GPUS_DIRECTORY = '/proc/driver/nvidia/gpus';
  private static readonly RENDER_NODE_PATTERN = /^renderD\d+$/;

  constructor(
    private readonly ffmpegProcessRunner: FfmpegProcessRunner,
  ) {
  }

  async enumerate(): Promise<FfmpegDevice[]> {
    const compiledInApis = await this.listCompiledInApis();
    const renderNodes = await this.listRenderNodes();

    const devices: FfmpegDevice[] = [];
    if (compiledInApis.has('cuda')) {
      devices.push(...await this.listCudaDevices());
    }
    if (compiledInApis.has('vaapi')) {
      devices.push(...renderNodes
        .filter((node) => node.vendor !== 'nvidia')
        .map((node) => createFfmpegDevice('vaapi', node.path, node.vendor)));
    }
    if (compiledInApis.has('qsv')) {
      devices.push(...renderNodes
        .filter((node) => node.vendor === 'intel')
        .map((node) => createFfmpegDevice('qsv', node.path, node.vendor)));
    }
    return devices;
  }

  private async listRenderNodes(): Promise<{ path: string, vendor: FfmpegDeviceVendor }[]> {
    const entries = await FfmpegDeviceEnumerator.readDirectoryOrEmpty(FfmpegDeviceEnumerator.DRI_DIRECTORY);
    const nodeNames = entries.filter((entry) => FfmpegDeviceEnumerator.RENDER_NODE_PATTERN.test(entry)).sort();

    const renderNodes = [];
    for (const nodeName of nodeNames) {
      renderNodes.push({
        path: Path.join(FfmpegDeviceEnumerator.DRI_DIRECTORY, nodeName),
        vendor: await this.readVendor(nodeName),
      });
    }
    return renderNodes;
  }

  private async readVendor(nodeName: string): Promise<FfmpegDeviceVendor> {
    try {
      const vendorId = (await Fs.promises.readFile(Path.join(FfmpegDeviceEnumerator.DRM_SYSFS_DIRECTORY, nodeName, 'device', 'vendor'), 'utf-8')).trim().toLowerCase();
      return PCI_VENDOR_IDS[vendorId] ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /** The driver's entries are PCI addresses and say nothing about CUDA ordinals – only their number is used: ordinals are 0 to n-1 */
  private async listCudaDevices(): Promise<FfmpegDevice[]> {
    const gpuCount = (await FfmpegDeviceEnumerator.readDirectoryOrEmpty(FfmpegDeviceEnumerator.NVIDIA_GPUS_DIRECTORY)).length;
    return Array.from({ length: gpuCount }, (_, ordinal) => createFfmpegDevice('cuda', ordinal.toString(), 'nvidia'));
  }

  private async listCompiledInApis(): Promise<Set<string>> {
    const handle = this.ffmpegProcessRunner.spawn(['-hwaccels'], {
      logVerbosity: 'error',
      captureStdout: true,
      timeoutInMillis: 15_000,
    });

    const exitResult = await handle.waitForExit();
    if (exitResult.exitCode !== 0) {
      throw new Error(`Failed to list the hardware APIs FFmpeg was built with (exitCode=${exitResult.exitCode}, signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
    }

    return new Set(handle.getStdout()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.endsWith(':')));
  }

  private static async readDirectoryOrEmpty(directory: string): Promise<string[]> {
    try {
      return await Fs.promises.readdir(directory);
    } catch {
      return [];
    }
  }
}

