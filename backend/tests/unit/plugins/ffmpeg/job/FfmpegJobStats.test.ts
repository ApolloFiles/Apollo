import FfmpegJobStats, { type FfmpegAttemptRecord } from '#src/plugins/official/ffmpeg/job/FfmpegJobStats.js';

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

describe(FfmpegJobStats, () => {
  let stats: FfmpegJobStats;

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    stats = new FfmpegJobStats();
  });

  test('Logs a debug line naming the job, its verdict and the acceleration it used', () => {
    stats.record({ ...record('live-transcode'), accel: 'cuda:0/fullChain', verdict: 'failed', failureKind: 'device' });

    expect(console.debug).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/'live-transcode' failed using 'cuda:0\/fullChain' \(device\)/));
  });

  describe('for a failed attempt', () => {
    test('Names the input file', () => {
      stats.record({ ...record('poster-candidates'), verdict: 'failed', args: ['-i', '/media/broken.mkv', '-f', 'null', '-'] });

      expect(console.debug).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`input='/media/broken.mkv'`));
    });

    test('Reports what FFmpeg complained about', () => {
      stats.record({
        ...record('video-thumbnail-frame-extraction'),
        verdict: 'failed',
        failureKind: 'unknown',
        logProblems: '[out#0/image2] [warning] Output file is empty, nothing was encoded',
      });

      expect(console.debug).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Output file is empty, nothing was encoded'));
    });
  });

  describe('for a successful attempt', () => {
    test('Leaves the input file out', () => {
      stats.record({ ...record('poster-candidates'), args: ['-i', '/media/fine.mkv', '-f', 'null', '-'] });

      expect(console.debug).toHaveBeenCalledExactlyOnceWith(expect.not.stringContaining('/media/fine.mkv'));
    });

    test('Leaves what FFmpeg complained about out', () => {
      stats.record({ ...record('live-transcode'), logProblems: '[warning] deprecated pixel format used' });

      expect(console.debug).toHaveBeenCalledExactlyOnceWith(expect.not.stringContaining('deprecated pixel format used'));
    });
  });
});
