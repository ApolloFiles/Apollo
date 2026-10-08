import type { Mock } from 'vitest';
import FfmpegHandle from '#src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type { LiveTranscodeHandle } from '#src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import VideoLiveTranscodeMedia from '#src/plugins/official/media/_old/video-player/live-transcode/VideoLiveTranscodeMedia.js';
import FakeChildProcess from '#tests/unit/plugins/ffmpeg/process/FakeChildProcess.js';

describe(VideoLiveTranscodeMedia, () => {
  let childProcess: FakeChildProcess;
  let handle: LiveTranscodeHandle;
  let media: VideoLiveTranscodeMedia;

  beforeEach(() => {
    childProcess = new FakeChildProcess();
    childProcess.on('killed', () => childProcess.simulateClose(null, 'SIGKILL'));
    handle = {
      process: new FfmpegHandle(childProcess.asChildProcess(), [], { captureFullLog: false, captureStdout: false }),
      masterHlsFileName: 'master.m3u8',
      mediaDuration: 42,
      startOffset: 0,
      audioNameMap: new Map(),
      burnedInSubtitleStreamIndex: null,
      accelId: 'cuda:0/fullChain',
    };
    media = new VideoLiveTranscodeMedia(null as never, handle, null as never, 'abc', { subtitles: [], fonts: [] }, null as never, new Map());
  });

  test('Names what the transcode runs on', () => {
    expect(media.accelId).toBe('cuda:0/fullChain');
  });

  describe('watchForCrash', () => {
    let onCrash: Mock<() => void>;

    beforeEach(() => {
      onCrash = vi.fn();
    });

    test('Reports a transcode that dies after it started serving', () => {
      media.watchForCrash(onCrash);

      childProcess.simulateClose(190);

      expect(onCrash).toHaveBeenCalledExactlyOnceWith();
    });

    test('Reports a transcode that already died before anyone watched it', () => {
      childProcess.simulateClose(190);

      media.watchForCrash(onCrash);

      expect(onCrash).toHaveBeenCalledExactlyOnceWith();
    });

    test('Reports a transcode that was killed by something else, such as the OOM killer', () => {
      media.watchForCrash(onCrash);

      childProcess.simulateClose(null, 'SIGKILL');

      expect(onCrash).toHaveBeenCalledExactlyOnceWith();
    });

    test('Does not report a transcode that ran to completion', () => {
      media.watchForCrash(onCrash);

      childProcess.simulateClose(0);

      expect(onCrash).not.toHaveBeenCalled();
    });

    test('Does not report a transcode that was stopped on purpose after watching started', async () => {
      media.watchForCrash(onCrash);

      await handle.process.kill();

      expect(onCrash).not.toHaveBeenCalled();
    });

    test('Does not report a transcode that was stopped on purpose before anyone watched it', async () => {
      await handle.process.kill();

      media.watchForCrash(onCrash);

      expect(onCrash).not.toHaveBeenCalled();
    });
  });
});
