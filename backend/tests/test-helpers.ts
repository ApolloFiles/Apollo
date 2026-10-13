import Fs from 'node:fs';
import Path from 'node:path';
import { inject } from 'vitest';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import type { DeepPartial } from 'ts-essentials';
import { VITEST_ROOT_DIRECTORY } from '#tests/test-constants.js';

export function createStrictDeepMock<T>(mockImplementation?: DeepPartial<T>): DeepMockProxy<T> {
  return mockDeep<T>(
    {
      fallbackMockImplementation: () => {
        throw new Error('Mock not implemented');
      },
    },
    mockImplementation,
  );
}

/** An empty directory for the calling test; the project's global teardown removes it with the rest of the run's directories */
export async function createTemporaryTestDirectory(): Promise<string> {
  return Fs.promises.mkdtemp(Path.join(inject('temporaryTestDirectoryRoot'), 'test-'));
}

/** Leaves the directory in place while another project's run still has files in it */
export async function removeVitestRootDirectoryIfEmpty(): Promise<void> {
  await Fs.promises.rmdir(VITEST_ROOT_DIRECTORY).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOTEMPTY' && err.code !== 'ENOENT') {
      throw err;
    }
  });
}

declare module 'vitest' {
  interface ProvidedContext {
    temporaryTestDirectoryRoot: string;
  }
}
