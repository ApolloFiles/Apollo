import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FfmpegJob } from '../../../../../../../src/plugins/official/ffmpeg/job/FfmpegJob.js';
import type FfmpegJobRunner from '../../../../../../../src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import FontExtractor from '../../../../../../../src/plugins/official/media/_old/watch/live_transcode/extractor/FontExtractor.js';
import type { ExtendedVideoAnalysis, Stream } from '../../../../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';

function attachment(index: number, codecName: string, filename?: string, extraDataSize = 512): Stream {
  return { index, codecType: 'attachment', codecName, extraDataSize, tags: filename != null ? { filename } : {} } as unknown as Stream;
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
      { fileName: 'arial.ttf', streamIndex: 1, byteSize: 512 },
      { fileName: 'some_font.otf', streamIndex: 2, byteSize: 512 },
      { fileName: 'other.woff', streamIndex: 3, byteSize: 512 },
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

    expect(plan).toEqual([{ fileName: 'arial_bold.ttf', streamIndex: 1, byteSize: 512 }]);
  });

  test.each(['', '.', '..'])("Skips an attachment named '%s', which is a directory and not a file", (filename) => {
    expect(FontExtractor.planExtraction(analysis(attachment(1, 'ttf', filename)))).toEqual([]);
  });
});

describe('FontExtractor.buildArgs', () => {
  test('Dumps every attachment from a single input', () => {
    const args = FontExtractor.buildArgs('/media/in.mkv', '/tmp/fonts', [
      { fileName: 'arial.ttf', streamIndex: 14, byteSize: 512 },
      { fileName: 'comic.otf', streamIndex: 15, byteSize: 512 },
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

describe('FontExtractor.extract with an incomplete dump', () => {
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-font-unit-'));
  });

  afterEach(async () => {
    await Fs.promises.rm(targetDir, { recursive: true, force: true });
  });

  function runnerDumping(byteCount: number): FfmpegJobRunner {
    return {
      run: vi.fn(async (job: FfmpegJob<unknown>) => {
        await Fs.promises.writeFile(Path.join(targetDir, 'arial.ttf'), Buffer.alloc(byteCount, 0x2a));
        return job;
      }),
    } as unknown as FfmpegJobRunner;
  }

  test.each([0, 511])('Drops a font that stopped after %i of its 512 bytes', async (byteCount) => {
    const extractor = new FontExtractor(runnerDumping(byteCount));

    await expect(extractor.extract('/media/in.mkv', analysis(attachment(1, 'ttf', 'Arial.ttf')), targetDir))
      .resolves.toEqual([]);
  });

  test('Keeps a font that was dumped in full', async () => {
    const extractor = new FontExtractor(runnerDumping(512));

    await expect(extractor.extract('/media/in.mkv', analysis(attachment(1, 'ttf', 'Arial.ttf')), targetDir))
      .resolves.toEqual([{ fileName: 'arial.ttf', streamIndex: 1, byteSize: 512 }]);
  });
});
