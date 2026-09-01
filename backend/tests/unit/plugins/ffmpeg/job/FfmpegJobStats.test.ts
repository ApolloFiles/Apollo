import { beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegJobStats, { type FfmpegAttemptRecord } from '../../../../../src/plugins/official/ffmpeg/job/FfmpegJobStats.js';

function record(job: string): FfmpegAttemptRecord {
  return {
    job,
    accel: 'software',
    verdict: 'ok',
    failureKind: null,
    runtimeInMillis: 10,
    frames: 1,
    peakFps: null,
    speed: null,
    recordedAt: new Date(0),
    args: [],
    logProblems: '',
  };
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

describe('FfmpegJobStats#record', () => {
  test('Leaves a debug line per attempt', () => {
    const stats = new FfmpegJobStats();

    stats.record({ ...record('live-transcode'), accel: 'cuda:0/fullChain', verdict: 'failed', failureKind: 'device' });

    expect(console.debug).toHaveBeenCalledWith(expect.stringMatching(/'live-transcode' failed using 'cuda:0\/fullChain' \(device\)/));
  });
});
