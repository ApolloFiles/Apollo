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

  test('A failed attempt names the file it was pointed at', () => {
    const stats = new FfmpegJobStats();

    stats.record({ ...record('poster-candidates'), verdict: 'failed', args: ['-i', '/media/broken.mkv', '-f', 'null', '-'] });

    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining(`input='/media/broken.mkv'`));
  });

  test('A successful attempt stays short', () => {
    const stats = new FfmpegJobStats();

    stats.record({ ...record('poster-candidates'), args: ['-i', '/media/fine.mkv', '-f', 'null', '-'] });

    expect(console.debug).toHaveBeenCalledWith(expect.not.stringContaining('/media/fine.mkv'));
  });
});
