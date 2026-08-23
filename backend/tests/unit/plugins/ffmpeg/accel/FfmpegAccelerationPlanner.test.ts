import { describe, expect, test } from 'vitest';
import FfmpegAccelerationPlanner from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegAccelerationPlanner.js';
import type FfmpegCapabilities from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegCapabilities.js';
import type { FfmpegHardwareAcceleration } from '../../../../../src/plugins/official/ffmpeg/accel/FfmpegHardwareAcceleration.js';

function createPlanner(usableDecodeAccelerations: FfmpegHardwareAcceleration[], usableVideoEncoders: string[] = []): FfmpegAccelerationPlanner {
  const capabilities = {
    getUsableDecodeAccelerations: async () => usableDecodeAccelerations,
    filterUsableVideoEncoders: async (candidates: readonly string[]) => candidates.filter((candidate) => usableVideoEncoders.includes(candidate)),
  } as unknown as FfmpegCapabilities;

  return new FfmpegAccelerationPlanner(capabilities);
}

describe('FfmpegAccelerationPlanner#plan for a job that only decodes', () => {
  test('Offers hardware decoding first and software second', async () => {
    const planner = createPlanner(['cuda']);

    const profiles = await planner.plan({ mayUseHardwareDecoding: true });

    expect(profiles).toEqual([
      { id: 'cuda', decodeAcceleration: 'cuda', videoEncoder: null },
      { id: 'software', decodeAcceleration: null, videoEncoder: null },
    ]);
  });

  test('Gives every usable decode acceleration a turn before software does', async () => {
    const planner = createPlanner(['cuda', 'qsv', 'vaapi']);

    const profiles = await planner.plan({ mayUseHardwareDecoding: true });

    expect(profiles.map((profile) => profile.id)).toEqual(['cuda', 'qsv', 'vaapi', 'software']);
  });

  test('Offers a single software profile when no hardware is usable', async () => {
    const planner = createPlanner([]);

    const profiles = await planner.plan({ mayUseHardwareDecoding: true });

    expect(profiles.map((profile) => profile.id)).toEqual(['software']);
  });

  test('Offers a single software profile when the job may not use hardware decoding', async () => {
    const planner = createPlanner(['cuda']);

    const profiles = await planner.plan({ mayUseHardwareDecoding: false });

    expect(profiles.map((profile) => profile.id)).toEqual(['software']);
  });
});

describe('FfmpegAccelerationPlanner#plan for a job that encodes video', () => {
  test('Hands the file to the next device before giving up on hardware decoding', async () => {
    const planner = createPlanner(['cuda', 'qsv'], ['h264_nvenc', 'libx264']);

    const profiles = await planner.plan({
      mayUseHardwareDecoding: true,
      videoEncoderCandidates: ['h264_nvenc', 'libx264'],
    });

    expect(profiles.map((profile) => profile.id)).toEqual(['cuda+h264_nvenc', 'qsv+h264_nvenc', 'h264_nvenc', 'libx264']);
  });

  test('Drops hardware decoding before it drops the encoder', async () => {
    const planner = createPlanner(['cuda'], ['h264_nvenc', 'libx264']);

    const profiles = await planner.plan({
      mayUseHardwareDecoding: true,
      videoEncoderCandidates: ['h264_nvenc', 'h264_qsv', 'libx264'],
    });

    expect(profiles.map((profile) => profile.id)).toEqual(['cuda+h264_nvenc', 'h264_nvenc', 'libx264']);
  });

  test('Keeps the order the encoder candidates were given in', async () => {
    const planner = createPlanner([], ['h264_qsv', 'libx264']);

    const profiles = await planner.plan({
      mayUseHardwareDecoding: false,
      videoEncoderCandidates: ['h264_nvenc', 'h264_qsv', 'libx264'],
    });

    expect(profiles.map((profile) => profile.videoEncoder)).toEqual(['h264_qsv', 'libx264']);
  });

  test('Ends on the last candidate the job named, so omitting a software encoder makes it fail', async () => {
    const planner = createPlanner([], ['libx264']);

    const profiles = await planner.plan({
      mayUseHardwareDecoding: false,
      videoEncoderCandidates: ['h264_nvenc', 'libx264'],
    });

    expect(profiles.map((profile) => profile.id)).toEqual(['libx264']);
  });

  test('Throws when none of the candidates can be used on this machine', async () => {
    const planner = createPlanner(['cuda'], []);

    await expect(planner.plan({
      mayUseHardwareDecoding: true,
      videoEncoderCandidates: ['h264_nvenc', 'h264_qsv'],
    })).rejects.toThrow(/None of the video encoders \(h264_nvenc, h264_qsv\)/);
  });
});
