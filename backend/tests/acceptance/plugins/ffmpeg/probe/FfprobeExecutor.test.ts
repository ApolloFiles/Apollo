import { FfprobeExecutor } from '#src/plugins/official/ffmpeg/probe/FfprobeExecutor.js';
import { ffmpegEnvironment, requireFfmpeg, requireSample } from '../FfmpegTestEnvironment.js';

describe(FfprobeExecutor, () => {
  let executor: FfprobeExecutor;

  beforeEach(() => {
    executor = new FfprobeExecutor();
  });

  test('Reports every stream of a real file in a full probe', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().pgsSample, 'an h264 sample with PGS subtitles');

    const raw = await executor.probeFull(sample.path);

    expect((raw.streams as { codec_type: string }[]).map((stream) => stream.codec_type)).toEqual(['video', 'audio', 'subtitle']);
    expect(raw.chapters).toEqual([]);
  });

  test('Leaves streams and chapters out of a format probe', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().pgsSample, 'an h264 sample with PGS subtitles');

    const raw = await executor.probeFormat(sample.path);

    expect(Object.keys(raw)).toEqual(['format']);
  });

  test('Rejects a missing file with ffprobe\'s exit code and error', async (ctx) => {
    requireFfmpeg(ctx);

    const probe = executor.probeFull('/does/not/exist.mkv');

    await expect(probe).rejects.toThrow('ffprobe exited with code 1');
    await expect(probe).rejects.toThrow('No such file or directory');
  });
});
