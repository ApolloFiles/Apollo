import { singleton } from 'tsyringe';
import { createFfmpegDevice, type FfmpegDevice, parseFfmpegDeviceId } from './FfmpegDevice.js';
import FfmpegDeviceConfig from './FfmpegDeviceConfig.js';
import FfmpegDeviceEnumerator from './FfmpegDeviceEnumerator.js';

/** The devices jobs may use, in the order they are to be tried */
@singleton()
export default class FfmpegDeviceRegistry {
  private devices: Promise<readonly FfmpegDevice[]> | null = null;

  constructor(
    private readonly deviceEnumerator: FfmpegDeviceEnumerator,
    private readonly deviceConfig: FfmpegDeviceConfig,
  ) {
  }

  async getDevices(): Promise<readonly FfmpegDevice[]> {
    if (this.devices == null) {
      this.devices = this.determineDevices();
      this.devices.catch(() => this.devices = null);
    }
    return this.devices;
  }

  private async determineDevices(): Promise<readonly FfmpegDevice[]> {
    const selection = this.deviceConfig.getSelection();
    if (selection.mode === 'off') {
      return [];
    }

    const discoveredDevices = await this.deviceEnumerator.enumerate();
    const devices = selection.mode === 'auto'
      ? discoveredDevices
      : FfmpegDeviceRegistry.applyAllowlist(discoveredDevices, selection.deviceIds);

    console.info(`FFmpeg hardware devices: ${devices.map((device) => `${device.id} (${device.vendor})`).join(', ') || '<none>'}`);
    return devices;
  }

  /**
   * An id the enumeration did not find is kept anyway: the admin knows their machine, and a device that really is
   * not there fails its first probe in well under a second and stays out of the way from then on.
   */
  private static applyAllowlist(discoveredDevices: readonly FfmpegDevice[], deviceIds: readonly string[]): FfmpegDevice[] {
    return deviceIds.map((deviceId) => {
      const discoveredDevice = discoveredDevices.find((device) => device.id === deviceId);
      if (discoveredDevice != null) {
        return discoveredDevice;
      }

      console.warn(`The FFmpeg device '${deviceId}' from APOLLO_FFMPEG_DEVICES was not found on this machine (found: ${discoveredDevices.map((device) => device.id).join(', ') || 'none'}) – trying it anyway`);
      const parsedId = parseFfmpegDeviceId(deviceId)!;
      return createFfmpegDevice(parsedId.api, parsedId.address, 'unknown');
    });
  }
}
