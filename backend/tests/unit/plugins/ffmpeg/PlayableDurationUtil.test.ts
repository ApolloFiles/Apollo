import { describe, expect, test } from 'vitest';
import type { ExtendedProbeResult } from '../../../../src/plugins/official/ffmpeg/probe/FfprobeExecutor.js';
import PlayableDurationUtil, {
  type DurationRelevantStream,
} from '../../../../src/plugins/official/ffmpeg/probe/PlayableDurationUtil.js';

function stream(partial: Partial<DurationRelevantStream> & { type: DurationRelevantStream['type'] }): DurationRelevantStream {
  return {
    tags: {},
    ...partial,
  };
}

function probeResult(formatDuration: string | undefined, streams: Record<string, unknown>[]): ExtendedProbeResult {
  return { format: { duration: formatDuration }, streams } as unknown as ExtendedProbeResult;
}

describe('PlayableDurationUtil#determineStreamSpanInSec', () => {
  test('Reads the Matroska DURATION tag', () => {
    const span = PlayableDurationUtil.determineStreamSpanInSec(stream({
      type: 'video',
      tags: { DURATION: '01:51:00.123000000' },
    }));
    expect(span).toBeCloseTo(6660.123, 3);
  });

  test('Reads the language-suffixed DURATION tag written by MakeMKV', () => {
    const span = PlayableDurationUtil.determineStreamSpanInSec(stream({
      type: 'audio',
      tags: { 'DURATION-eng': '00:02:00.000000000' },
    }));
    expect(span).toBe(120);
  });

  test('Prefers the DURATION tag over the stream duration', () => {
    const span = PlayableDurationUtil.determineStreamSpanInSec(stream({
      type: 'video',
      duration: '9999.0',
      tags: { DURATION: '00:01:00.000000000' },
    }));
    expect(span).toBe(60);
  });

  test('Falls back to the stream duration (MP4)', () => {
    const span = PlayableDurationUtil.determineStreamSpanInSec(stream({ type: 'video', duration: '1234.567' }));
    expect(span).toBeCloseTo(1234.567, 3);
  });

  test('Falls back to duration_ts scaled by the time base', () => {
    const span = PlayableDurationUtil.determineStreamSpanInSec(stream({
      type: 'video',
      durationTs: 1_234_567,
      timeBase: '1/1000',
    }));
    expect(span).toBeCloseTo(1234.567, 3);
  });

  test.each([
    ['nothing at all', stream({ type: 'video' })],
    ['a malformed DURATION tag', stream({ type: 'video', tags: { DURATION: 'N/A' } })],
    ['a non-numeric stream duration', stream({ type: 'video', duration: 'N/A' })],
    ['a zero-length stream', stream({ type: 'video', duration: '0' })],
    ['duration_ts without a time base', stream({ type: 'video', durationTs: 1000 })],
    ['a time base with a zero denominator', stream({ type: 'video', durationTs: 1000, timeBase: '1/0' })],
  ])('Returns null for %s', (_label, candidate) => {
    expect(PlayableDurationUtil.determineStreamSpanInSec(candidate)).toBeNull();
  });
});

describe('PlayableDurationUtil#determinePlayableDurationInSec', () => {
  test('Ignores a container duration inflated by a longer subtitle track', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'video', tags: { DURATION: '01:51:00.000000000' } }),
      stream({ type: 'audio', tags: { DURATION: '01:51:00.000000000' } }),
    ], 6720); // 01:52:00 – the subtitle track outlives video and audio by a minute

    expect(duration).toBe(6660);
  });

  test('Prefers the video track over a longer audio track', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'video', duration: '600' }),
      stream({ type: 'audio', duration: '660' }),
    ], 660);

    expect(duration).toBe(600);
  });

  test('Uses the longest video track when there are multiple', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'video', duration: '300' }),
      stream({ type: 'video', duration: '600' }),
    ], 600);

    expect(duration).toBe(600);
  });

  // Numbers taken from an actual `ffmpeg`-muxed Matroska file with embedded cover art. Note that its
  // `disposition.attached_pic` is 0 – FFmpeg refuses to write that flag into Matroska – so the cover
  // art can only be told apart from a real video stream by how little of the file it spans.
  test('Ignores cover art embedded as a video stream', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'audio', tags: { DURATION: '00:00:30.023000000' } }),
      stream({ type: 'video', tags: { DURATION: '00:00:00.063000000' } }),
    ], 30.023);

    expect(duration).toBeCloseTo(30.023, 3);
  });

  test('Falls back to the longest audio track for files without video', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'audio', duration: '540' }),
      stream({ type: 'audio', duration: '600' }),
    ], 620);

    expect(duration).toBe(600);
  });

  test('Falls back to the container duration when no stream exposes one', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'video' }),
      stream({ type: 'audio' }),
    ], 6720);

    expect(duration).toBe(6720);
  });

  test('Never reports more than the container claims', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'video', tags: { DURATION: '99:00:00.000000000' } }),
    ], 6720);

    expect(duration).toBe(6720);
  });

  test('Returns null when neither the streams nor the container provide anything usable', () => {
    expect(PlayableDurationUtil.determinePlayableDurationInSec([stream({ type: 'video' })], null)).toBeNull();
    expect(PlayableDurationUtil.determinePlayableDurationInSec([], 0)).toBeNull();
  });

  test('Uses the streams when the container does not report a duration', () => {
    const duration = PlayableDurationUtil.determinePlayableDurationInSec([
      stream({ type: 'video', duration: '600' }),
    ], null);

    expect(duration).toBe(600);
  });
});

describe('PlayableDurationUtil#determineProbedPlayableDurationInSec', () => {
  test('Ignores a subtitle stream that outlives video and audio', () => {
    const duration = PlayableDurationUtil.determineProbedPlayableDurationInSec(probeResult('50428.000000', [
      { codec_type: 'video', time_base: '1/1000', tags: { DURATION: '00:30:45.640000000' } },
      { codec_type: 'audio', time_base: '1/1000', tags: { DURATION: '00:30:45.638000000' } },
      { codec_type: 'subtitle', time_base: '1/1000', duration: '50428.000000', tags: { DURATION: '14:00:28.000000000' } },
    ]));

    expect(duration).toBeCloseTo(1845.64, 2);
  });

  test('Falls back to the container duration when no stream reports a span', () => {
    const duration = PlayableDurationUtil.determineProbedPlayableDurationInSec(probeResult('1234.5', [
      { codec_type: 'video', time_base: '1/1000', tags: {} },
    ]));

    expect(duration).toBeCloseTo(1234.5, 1);
  });

  test('Returns null when nothing reports a duration at all', () => {
    expect(PlayableDurationUtil.determineProbedPlayableDurationInSec(probeResult(undefined, []))).toBeNull();
  });
});
