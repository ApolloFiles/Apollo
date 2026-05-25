import { singleton } from 'tsyringe';
import type { ZodSafeParseResult } from 'zod';
import type ApolloUserCacheFileSystem from '../../../files/cache/user/ApolloUserCacheFileSystem.js';
import FileSystemProvider from '../../../files/FileSystemProvider.js';
import type LocalFile from '../../../files/local/LocalFile.js';
import FfprobeExecutor, { type ExtendedProbeResult, type ProbeResult } from './FfprobeExecutor.js';
import { PROBE_RESULT_FULL_SCHEMA, PROBE_RESULT_SCHEMA } from './FfprobeValidationSchemas.js';

@singleton()
export default class CachedFfprobeExecutor {
  private readonly CACHE_ID_PREFIX = 'apollo_ffmpeg-ffprobe.';

  constructor(
    private readonly ffprobeExecutor: FfprobeExecutor,
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async probeFormat(file: LocalFile): Promise<ProbeResult> {
    return this.handleProbe(
      file,
      'format',
      PROBE_RESULT_SCHEMA.safeParse,
      (filePath) => this.ffprobeExecutor.probeFormat(filePath),
    );
  }

  async probeFull(file: LocalFile): Promise<ExtendedProbeResult> {
    return this.handleProbe(
      file,
      'full',
      PROBE_RESULT_FULL_SCHEMA.safeParse,
      (filePath) => this.ffprobeExecutor.probeFull(filePath),
    );
  }

  private async handleProbe<R>(
    file: LocalFile,
    cacheSuffix: 'format' | 'full',
    parseCachedData: (input: unknown) => ZodSafeParseResult<R>,
    runFfprobe: (filePath: string) => Promise<R>,
  ): Promise<R> {
    const cacheFileSystem = this.determineCacheFileSystem(file);

    return await cacheFileSystem.acquireWriteLockForFile(
      file,
      this.CACHE_ID_PREFIX + cacheSuffix,
      async (cacheFile) => {
        if (await cacheFile.file.exists()) {
          const cachedData = parseCachedData(JSON.parse((await cacheFile.file.read()).toString('utf-8')));
          if (cachedData.error) {
            console.warn('cached ffprobe result is invalid:', cachedData.error);
          } else {
            return cachedData.data;
          }
        }

        const data = await runFfprobe(file.getAbsolutePathOnHost());
        await cacheFile.write(Buffer.from(JSON.stringify(data)));
        return data;
      });
  }

  private determineCacheFileSystem(file: LocalFile): ApolloUserCacheFileSystem {
    if (file.fileSystem.owner == null) {
      throw new Error('Unable to cache ffprobe result for files without owner');
    }
    return this.fileSystemProvider.provideApolloFileSystemsForUser(file.fileSystem.owner).cache;
  }
}
