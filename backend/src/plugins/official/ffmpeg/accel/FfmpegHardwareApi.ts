/** Named after the `-hwaccel` values */
export const FFMPEG_HARDWARE_APIS = ['cuda', 'vaapi', 'qsv'] as const;
export type FfmpegHardwareApi = (typeof FFMPEG_HARDWARE_APIS)[number];

export function isFfmpegHardwareApi(value: string): value is FfmpegHardwareApi {
  return (FFMPEG_HARDWARE_APIS as readonly string[]).includes(value);
}
