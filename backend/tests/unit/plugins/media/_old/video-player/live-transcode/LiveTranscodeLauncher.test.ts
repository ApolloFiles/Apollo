import { describe, expect, test } from 'vitest';
import LiveTranscodeLauncher from '../../../../../../../src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import type { VideoStream } from '../../../../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';

function videoStream(avgFrameRate: string): VideoStream {
  return { avgFrameRate } as unknown as VideoStream;
}

describe('LiveTranscodeLauncher.determineTargetFrameRate', () => {
  test('Keeps a film frame rate as it is, without forcing it to 30', () => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('24000/1001'))).toEqual({ fps: 24000 / 1001, capFrameRate: false });
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('25'))).toEqual({ fps: 25, capFrameRate: false });
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('60/1'))).toEqual({ fps: 60, capFrameRate: false });
  });

  test('Brings high frame rates down to 60', () => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('144/1'))).toEqual({ fps: 60, capFrameRate: true });
  });

  test('Does not let a damaged file dictate the GOP', () => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('1000/1'))).toEqual({ fps: 60, capFrameRate: true });
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream('90000/1'))).toEqual({ fps: 60, capFrameRate: true });
  });

  test.each(['0/0', '0', 'abc', '', '25/0'])("Falls back to 30 fps for '%s'", (avgFrameRate) => {
    expect(LiveTranscodeLauncher.determineTargetFrameRate(videoStream(avgFrameRate))).toEqual({ fps: 30, capFrameRate: false });
  });
});
