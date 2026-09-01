import { singleton } from 'tsyringe';
import { type Accel, SOFTWARE } from '../accel/Accel.js';
import FfmpegCapabilityCache from '../accel/FfmpegCapabilityCache.js';
import type { FfmpegDevice } from '../accel/FfmpegDevice.js';
import FfmpegDeviceRegistry from '../accel/FfmpegDeviceRegistry.js';
import HwContext, { type HwMode } from '../accel/HwContext.js';
import PixelFormatUtil from '../accel/PixelFormatUtil.js';
import type { FfmpegAccelerationRequirement } from './FfmpegJob.js';

/**
 * Turns what a job needs into the ordered list of ways to run it – software is always last.
 *
 * Devices come in the admin's (or the enumerator's) order and are only offered in a mode their probes passed, so an
 * iGPU that cannot decode this file's codec is skipped for a full chain but still offered for encoding. Decoding
 * on a device with everything else in software is never offered: it measured no faster than software.
 */
@singleton()
export default class FfmpegCandidatePlanner {
  constructor(
    private readonly deviceRegistry: FfmpegDeviceRegistry,
    private readonly capabilityCache: FfmpegCapabilityCache,
  ) {
  }

  async plan(requirement: FfmpegAccelerationRequirement | null): Promise<Accel[]> {
    if (requirement == null) {
      return [SOFTWARE];
    }

    const devices = (await this.deviceRegistry.getDevices())
      .filter((device) => !(requirement.excludedApis ?? []).includes(device.api));
    const bitDepth = PixelFormatUtil.determineBitDepth(requirement.input.pixelFormat);

    const candidates: Accel[] = [];
    if (requirement.gpuFilters) {
      candidates.push(...await this.offer(devices, 'fullChain', requirement, bitDepth));
    }
    if (requirement.videoEncoder != null) {
      candidates.push(...await this.offer(devices, 'encodeOnly', requirement, bitDepth));
    }
    // Software is the last resort and deliberately beyond exclusion – a job with no candidate at all helps nobody
    candidates.push(SOFTWARE);

    return candidates;
  }

  /** Excluded ways of running are skipped before probing – a probe is a spawned process, and the caller already knows the answer */
  private async offer(devices: readonly FfmpegDevice[], mode: HwMode, requirement: FfmpegAccelerationRequirement, bitDepth: 8 | 10): Promise<HwContext[]> {
    const offered: HwContext[] = [];
    for (const device of devices) {
      const hwContext = new HwContext(device, mode, bitDepth);
      if ((requirement.excludedAccelIds ?? []).includes(hwContext.id)) {
        continue;
      }
      if (await this.passesProbes(device, mode, requirement, bitDepth)) {
        offered.push(hwContext);
      }
    }
    return offered;
  }

  private async passesProbes(device: FfmpegDevice, mode: HwMode, requirement: FfmpegAccelerationRequirement, bitDepth: 8 | 10): Promise<boolean> {
    if (mode === 'fullChain' && !await this.capabilityCache.canDecode(device, { ...requirement.input, bitDepth })) {
      return false;
    }
    if (requirement.videoEncoder != null && !await this.capabilityCache.canEncode(device, requirement.videoEncoder)) {
      return false;
    }
    return true;
  }
}
