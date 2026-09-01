import { describe, expect, test, vi } from 'vitest';
import FfmpegHandle from '../../../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import type { LiveTranscodeHandle } from '../../../../../../../src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import VideoLiveTranscodeMedia from '../../../../../../../src/plugins/official/media/_old/video-player/live-transcode/VideoLiveTranscodeMedia.js';
import FakeChildProcess from '../../../../ffmpeg/process/FakeChildProcess.js';

function createMedia(): { media: VideoLiveTranscodeMedia, childProcess: FakeChildProcess, handle: LiveTranscodeHandle } {
  const childProcess = new FakeChildProcess();
  childProcess.on('killed', () => childProcess.simulateClose(null, 'SIGKILL'));
  const handle: LiveTranscodeHandle = {
    process: new FfmpegHandle(childProcess.asChildProcess(), [], { captureFullLog: false, captureStdout: false }),
    masterHlsFileName: 'master.m3u8',
    mediaDuration: 42,
    startOffset: 0,
    audioNameMap: new Map(),
    burnedInSubtitleStreamIndex: null,
    accelId: 'cuda:0/fullChain',
  };

  const media = new VideoLiveTranscodeMedia(null as never, handle, null as never, 'abc', { subtitles: [], fonts: [] }, null as never, new Map());
  return { media, childProcess, handle };
}

describe('VideoLiveTranscodeMedia#watchForCrash', () => {
  test('Reports a transcode that dies after it started serving', () => {
    const { media, childProcess } = createMedia();
    const onCrash = vi.fn();

    media.watchForCrash(onCrash);
    childProcess.simulateClose(190);

    expect(onCrash).toHaveBeenCalledOnce();
  });

  test('Reports a transcode that already died before anyone watched it', () => {
    const { media, childProcess } = createMedia();
    const onCrash = vi.fn();

    childProcess.simulateClose(190);
    media.watchForCrash(onCrash);

    expect(onCrash).toHaveBeenCalledOnce();
  });

  test('Does not report a transcode that ran to completion', () => {
    const { media, childProcess } = createMedia();
    const onCrash = vi.fn();

    media.watchForCrash(onCrash);
    childProcess.simulateClose(0);

    expect(onCrash).not.toHaveBeenCalled();
  });

  test('Does not report a transcode that was stopped on purpose, before or after watching', async () => {
    const stoppedAfter = createMedia();
    const stoppedBefore = createMedia();
    const onCrash = vi.fn();

    stoppedAfter.media.watchForCrash(onCrash);
    await stoppedAfter.handle.process.kill();
    await stoppedBefore.handle.process.kill();
    stoppedBefore.media.watchForCrash(onCrash);

    expect(onCrash).not.toHaveBeenCalled();
  });

  test('Reports a transcode that was killed by something else, such as the OOM killer', () => {
    const { media, childProcess } = createMedia();
    const onCrash = vi.fn();

    media.watchForCrash(onCrash);
    childProcess.simulateClose(null, 'SIGKILL');

    expect(onCrash).toHaveBeenCalledOnce();
  });

  test('Names what the transcode ran on', () => {
    expect(createMedia().media.accelId).toBe('cuda:0/fullChain');
  });
});
