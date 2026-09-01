import { describe, expect, test } from 'vitest';
import WebVttSeekThumbnailGenerator from '../../../../../../../src/plugins/official/media/_old/video-player/seek-thumbnails/generator/WebVttSeekThumbnailGenerator.js';

function cuesOf(webVtt: string): [string, string][] {
  return webVtt.split('\n\n').slice(1).filter((cue) => cue !== '').map((cue) => cue.split('\n') as [string, string]);
}

describe('WebVttSeekThumbnailGenerator#generate', () => {
  const generator = new WebVttSeekThumbnailGenerator();

  test('Writes one cue per frame, ending where the next one starts', () => {
    const cues = cuesOf(generator.generate(2, [200, 200], 2, [0, 5, 10, 15], (fileIndex) => `sheet-${fileIndex}.jpg`));

    expect(cues).toEqual([
      ['00:00:00.000 --> 00:00:05.000', 'sheet-0.jpg#xywh=0,0,100,100'],
      ['00:00:05.000 --> 00:00:10.000', 'sheet-0.jpg#xywh=100,0,100,100'],
      ['00:00:10.000 --> 00:00:15.000', 'sheet-0.jpg#xywh=0,100,100,100'],
      ['00:00:15.000 --> 00:00:16.000', 'sheet-0.jpg#xywh=100,100,100,100'],
    ]);
  });

  test('Orders the cues by time when the frames were tiled out of order, keeping each cue on its frame', () => {
    const cues = cuesOf(generator.generate(2, [200, 200], 2, [0, 7.9, 1.4, 13.8, 25.1], (fileIndex) => `sheet-${fileIndex}.jpg`));

    expect(cues).toEqual([
      ['00:00:00.000 --> 00:00:01.400', 'sheet-0.jpg#xywh=0,0,100,100'],
      ['00:00:01.400 --> 00:00:07.900', 'sheet-0.jpg#xywh=0,100,100,100'],
      ['00:00:07.900 --> 00:00:13.800', 'sheet-0.jpg#xywh=100,0,100,100'],
      ['00:00:13.800 --> 00:00:25.100', 'sheet-0.jpg#xywh=100,100,100,100'],
      ['00:00:25.100 --> 00:00:26.100', 'sheet-1.jpg#xywh=0,0,100,100'],
    ]);
  });

  test('Keeps two keyframes within the same second apart', () => {
    const cues = cuesOf(generator.generate(2, [200, 200], 2, [3600.25, 3600.75], () => 'sheet.jpg'));

    expect(cues.map(([timing]) => timing)).toEqual([
      '01:00:00.250 --> 01:00:00.750',
      '01:00:00.750 --> 01:00:01.750',
    ]);
  });

  test('Writes no cue for a frame whose sprite sheet is gone', () => {
    const cues = cuesOf(generator.generate(1, [200, 200], 2, [0, 5, 10, 15, 20], (fileIndex) => `sheet-${fileIndex}.jpg`));

    expect(cues).toHaveLength(4);
    expect(cues.every(([, url]) => url.startsWith('sheet-0.jpg'))).toBe(true);
  });

  test('Writes no cues for no frames', () => {
    expect(generator.generate(2, [200, 200], 2, [], () => 'sheet.jpg')).toBe('WEBVTT\n\n');
  });
});
