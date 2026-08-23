/**
 * Hardware acceleration technologies Apollo knows how to use, most favorable first.
 *
 * Each is named after the `-hwaccel` value it decodes with – which is not always what it encodes with, NVIDIA
 * decoding through `cuda` but encoding through `nvenc`.
 */
export const FFMPEG_HARDWARE_ACCELERATIONS = ['cuda', 'qsv', 'vaapi'] as const;
export type FfmpegHardwareAcceleration = (typeof FFMPEG_HARDWARE_ACCELERATIONS)[number];
