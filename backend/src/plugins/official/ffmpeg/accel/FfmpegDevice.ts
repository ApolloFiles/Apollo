import { type FfmpegHardwareApi, isFfmpegHardwareApi } from './FfmpegHardwareApi.js';

export type FfmpegDeviceVendor = 'intel' | 'amd' | 'nvidia' | 'unknown';

export type FfmpegDevice = {
  /** e.g. `vaapi:/dev/dri/renderD128`, `qsv:/dev/dri/renderD128`, `cuda:0` */
  readonly id: string;
  readonly api: FfmpegHardwareApi;
  readonly vendor: FfmpegDeviceVendor;
  /** The render node path for `vaapi`/`qsv`, the ordinal for `cuda` */
  readonly address: string;
}

export function createFfmpegDevice(api: FfmpegHardwareApi, address: string, vendor: FfmpegDeviceVendor): FfmpegDevice {
  return { id: `${api}:${address}`, api, vendor, address };
}

export function parseFfmpegDeviceId(id: string): { api: FfmpegHardwareApi, address: string } | null {
  const separatorIndex = id.indexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }

  const api = id.substring(0, separatorIndex);
  const address = id.substring(separatorIndex + 1);
  if (!isFfmpegHardwareApi(api) || address === '') {
    return null;
  }
  return { api, address };
}
