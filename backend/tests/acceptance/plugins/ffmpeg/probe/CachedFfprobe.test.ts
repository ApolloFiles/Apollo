import Fs from 'node:fs';
import Path from 'node:path';
import type { MockInstance } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { ZodError } from 'zod';
import DatabaseClient from '#src/database/DatabaseClient.js';
import type LocalFile from '#src/files/local/LocalFile.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';
import { FfprobeCache } from '#src/plugins/official/ffmpeg/probe/cache/FfprobeCache.js';
import { CachedFfprobe } from '#src/plugins/official/ffmpeg/probe/CachedFfprobe.js';
import type { FfprobeExecutor } from '#src/plugins/official/ffmpeg/probe/FfprobeExecutor.js';
import { FfprobeResultParser } from '#src/plugins/official/ffmpeg/probe/FfprobeResultParser.js';
import type { RawProbeResult } from '#src/plugins/official/ffmpeg/probe/FfprobeSchemas.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createStrictDeepMock, createTemporaryTestDirectory } from '#tests/test-helpers.js';

const FORMAT = {
  filename: 'Arrival (2016).mkv',
  nb_streams: 1,
  nb_programs: 0,
  format_name: 'matroska,webm',
  format_long_name: 'Matroska / WebM',
  duration: '6967.103000',
  probe_score: 100,
};

const FULL_PROBE: RawProbeResult = {
  streams: [{
    index: 0,
    codec_type: 'audio',
    codec_name: 'aac',
    codec_tag_string: '[0][0][0][0]',
    codec_tag: '0x0000',
    sample_fmt: 'fltp',
    sample_rate: '48000',
    channels: 2,
    initial_padding: 1024,
    r_frame_rate: '0/0',
    avg_frame_rate: '0/0',
    time_base: '1/1000',
    disposition: { default: 1, forced: 0 },
  }],
  chapters: [],
  format: FORMAT,
};

describe(CachedFfprobe, () => {
  let databaseClient: DatabaseClient;
  let alice: ApolloUser;
  let executor: DeepMockProxy<FfprobeExecutor>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let movieOnHost: string;
  let movie: LocalFile;
  let ffprobe: CachedFfprobe;

  beforeAll(async () => {
    databaseClient = new DatabaseClient();
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
  });

  afterAll(async () => {
    await databaseClient.authUser.delete({ where: { id: alice.id } });
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    const tmpDir = await createTemporaryTestDirectory();
    const fileSystem = new LocalFileSystem('default', alice, { fs_local: { pathOnHost: Path.join(tmpDir, 'default') } });
    await Fs.promises.mkdir(Path.join(tmpDir, 'default', 'movies'), { recursive: true });
    movieOnHost = Path.join(tmpDir, 'default', 'movies', 'Arrival (2016).mkv');
    await Fs.promises.writeFile(movieOnHost, 'matroska video data');
    movie = fileSystem.getFile('/movies/Arrival (2016).mkv');

    const fullProbesByPath = new Map([[movieOnHost, FULL_PROBE]]);
    const formatProbesByPath = new Map([[movieOnHost, { format: FORMAT }]]);
    executor = createStrictDeepMock<FfprobeExecutor>();
    executor.probeFull.mockImplementation(async (filePath) => fullProbesByPath.get(filePath)!);
    executor.probeFormat.mockImplementation(async (filePath) => formatProbesByPath.get(filePath)!);
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { services } = createCacheTestServices(databaseClient, Path.join(tmpDir, 'cache'));
    ffprobe = new CachedFfprobe(executor, new FfprobeResultParser(), new FfprobeCache(services));
  });

  afterEach(async () => {
    await databaseClient.cacheUserEntry.deleteMany({ where: { userId: alice.id } });
  });

  test('Probes an unchanged file only once', async () => {
    await ffprobe.probeFull(movie);
    await ffprobe.probeFull(movie);

    expect(executor.probeFull).toHaveBeenCalledOnce();
  });

  test('Normalizes a cached probe like a fresh one', async () => {
    const fresh = await ffprobe.probeFull(movie);

    const cached = await ffprobe.probeFull(movie);

    expect(cached).toEqual(fresh);
    expect(cached.streams[0].disposition).toEqual({ default: true, forced: false });
  });

  test('Probes the file again once it changed', async () => {
    await ffprobe.probeFull(movie);
    await Fs.promises.writeFile(movieOnHost, 'a different, re-muxed video');

    await ffprobe.probeFull(movie);

    expect(executor.probeFull).toHaveBeenCalledTimes(2);
  });

  test('Does not serve a cached full probe for a format probe', async () => {
    await ffprobe.probeFull(movie);

    const probe = await ffprobe.probeFormat(movie);

    expect(Object.keys(probe)).toEqual(['format']);
    expect(executor.probeFormat).toHaveBeenCalledOnce();
  });

  test('Does not cache output the schema rejects', async () => {
    executor.probeFull.mockResolvedValueOnce({ format: FORMAT });
    await expect(ffprobe.probeFull(movie)).rejects.toThrow(ZodError);

    await ffprobe.probeFull(movie);

    expect(executor.probeFull).toHaveBeenCalledTimes(2);
  });

  test('Warns about unknown keys only when it really probed', async () => {
    executor.probeFull.mockResolvedValue({ ...FULL_PROBE, programs: [] });

    await ffprobe.probeFull(movie);
    await ffprobe.probeFull(movie);

    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('programs'));
  });
});
