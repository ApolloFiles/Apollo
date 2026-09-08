import { describe, expect, test, vi } from 'vitest';
import type FfmpegJobRunner from '../../../../../../../src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import FontExtractor from '../../../../../../../src/plugins/official/media/_old/watch/live_transcode/extractor/FontExtractor.js';
import type { ExtendedVideoAnalysis, Stream } from '../../../../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';

function attachment(index: number, codecName: string, filename?: string): Stream {
  return { index, codecType: 'attachment', codecName, tags: filename != null ? { filename } : {} } as unknown as Stream;
}

function analysis(...streams: Stream[]): ExtendedVideoAnalysis {
  return { streams } as unknown as ExtendedVideoAnalysis;
}

describe('FontExtractor.planExtraction', () => {
  test('Takes every font attachment that has a file name', () => {
    const plan = FontExtractor.planExtraction(analysis(
      { index: 0, codecType: 'video', codecName: 'h264', tags: {} } as unknown as Stream,
      attachment(1, 'ttf', 'Arial.ttf'),
      attachment(2, 'otf', 'Some Font.otf'),
      attachment(3, 'woff', 'other.woff'),
    ));

    expect(plan).toEqual([
      { fileName: 'arial.ttf', streamIndex: 1 },
      { fileName: 'some_font.otf', streamIndex: 2 },
      { fileName: 'other.woff', streamIndex: 3 },
    ]);
  });

  test('Skips attachments that are not fonts or have no file name', () => {
    const plan = FontExtractor.planExtraction(analysis(
      attachment(1, 'bin', 'thumbnail.bin'),
      attachment(2, 'ttf'),
    ));

    expect(plan).toEqual([]);
  });

  test('Asks for a file name only once, no matter how many attachments sanitize to it', () => {
    const plan = FontExtractor.planExtraction(analysis(
      attachment(1, 'ttf', 'Arial Bold.ttf'),
      attachment(2, 'ttf', 'Arial+Bold.ttf'),
    ));

    expect(plan).toEqual([{ fileName: 'arial_bold.ttf', streamIndex: 1 }]);
  });

  test.each(['', '.', '..'])("Skips an attachment named '%s', which is a directory and not a file", (filename) => {
    expect(FontExtractor.planExtraction(analysis(attachment(1, 'ttf', filename)))).toEqual([]);
  });
});

describe('FontExtractor.buildArgs', () => {
  test('Dumps every attachment from a single input', () => {
    const args = FontExtractor.buildArgs('/media/in.mkv', '/tmp/fonts', [
      { fileName: 'arial.ttf', streamIndex: 14 },
      { fileName: 'comic.otf', streamIndex: 15 },
    ]);

    expect(args).toEqual([
      '-bitexact', '-n',
      '-dump_attachment:14', '/tmp/fonts/arial.ttf',
      '-dump_attachment:15', '/tmp/fonts/comic.otf',
      '-i', '/media/in.mkv',
    ]);
  });
});

describe('FontExtractor.extract', () => {
  test('Does not touch FFmpeg for a file without font attachments', async () => {
    const ffmpegJobRunner = { run: vi.fn() };
    const extractor = new FontExtractor(ffmpegJobRunner as unknown as FfmpegJobRunner);

    await expect(extractor.extract('/media/in.mkv', analysis(attachment(1, 'bin', 'thumbnail.bin')), '/tmp/does-not-exist'))
      .resolves.toEqual([]);
    expect(ffmpegJobRunner.run).not.toHaveBeenCalled();
  });
});
