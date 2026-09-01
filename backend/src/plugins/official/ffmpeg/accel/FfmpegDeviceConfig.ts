import { singleton } from 'tsyringe';
import AppConfiguration from '../../../../config/AppConfiguration.js';
import { parseFfmpegDeviceId } from './FfmpegDevice.js';

export type FfmpegDeviceSelection =
  | { readonly mode: 'auto' }
  | { readonly mode: 'off' }
  /** Device ids in the order they are to be tried – nothing else is used, even if the machine has it */
  | { readonly mode: 'allowlist', readonly deviceIds: readonly string[] };

/**
 * FFmpeg's own default is the first render node it finds, which on a box with an iGPU next to a dedicated card is
 * usually the wrong one – so the admin gets to say which devices to use and in what order.
 */
@singleton()
export default class FfmpegDeviceConfig {
  private selection: FfmpegDeviceSelection | null = null;

  constructor(
    private readonly appConfiguration: AppConfiguration,
  ) {
  }

  getSelection(): FfmpegDeviceSelection {
    this.selection ??= this.parseSelection();
    return this.selection;
  }

  private parseSelection(): FfmpegDeviceSelection {
    const configuredValue = this.appConfiguration.config.ffmpeg.devices.trim();
    const normalizedValue = configuredValue.toLowerCase();

    if (normalizedValue === '' || normalizedValue === 'auto') {
      return { mode: 'auto' };
    }
    if (normalizedValue === 'off') {
      console.info('Hardware acceleration is turned off by APOLLO_FFMPEG_DEVICES');
      return { mode: 'off' };
    }

    const deviceIds = this.parseDeviceIds(configuredValue);
    if (deviceIds.length === 0) {
      console.warn(`APOLLO_FFMPEG_DEVICES='${configuredValue}' names no usable device – falling back to 'auto'`);
      return { mode: 'auto' };
    }

    console.info(`Hardware acceleration is restricted to ${deviceIds.join(', ')} by APOLLO_FFMPEG_DEVICES`);
    return { mode: 'allowlist', deviceIds };
  }

  private parseDeviceIds(configuredValue: string): string[] {
    return configuredValue.split(',')
      .map((deviceId) => deviceId.trim())
      .filter((deviceId) => deviceId !== '')
      .filter((deviceId) => {
        if (parseFfmpegDeviceId(deviceId) != null) {
          return true;
        }

        console.warn(`Ignoring '${deviceId}' in APOLLO_FFMPEG_DEVICES – expected '<cuda|vaapi|qsv>:<render node or ordinal>'`);
        return false;
      });
  }
}
